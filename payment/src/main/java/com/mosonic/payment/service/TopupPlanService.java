package com.mosonic.payment.service;

import com.mosonic.payment.common.BusinessRuleException;
import com.mosonic.payment.common.ResourceNotFoundException;
import com.mosonic.payment.domain.TopupPlanEntity;
import com.mosonic.payment.dto.CreateTopupPlanRequest;
import com.mosonic.payment.dto.TopupPlanResponse;
import com.mosonic.payment.dto.UpdateTopupPlanActiveRequest;
import com.mosonic.payment.dto.UpdateTopupPlanRequest;
import com.mosonic.payment.mapper.TopupPlanMapper;
import com.mosonic.payment.repository.TopupPlanRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class TopupPlanService {

    private final TopupPlanRepository repository;
    private final TopupPlanMapper mapper;

    @Transactional(readOnly = true)
    public List<TopupPlanResponse> list(boolean activeOnly) {
        List<TopupPlanEntity> plans = activeOnly
                ? repository.findAllByActiveTrueOrderBySortOrderAscCodeAsc()
                : repository.findAllByOrderBySortOrderAscCodeAsc();
        return plans.stream().map(mapper::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public TopupPlanResponse getByCode(String code) {
        return mapper.toResponse(findEntity(code));
    }

    @Transactional
    public TopupPlanResponse create(CreateTopupPlanRequest request, String createdBy) {
        String normalizedCode = request.getCode().trim().toLowerCase();
        if (repository.existsById(normalizedCode)) {
            throw new BusinessRuleException("Topup plan already exists: " + normalizedCode);
        }
        validateSellablePlan(request.isActive(), request.getCredits(), request.getPriceThb());
        TopupPlanEntity entity = mapper.toEntity(request);
        TopupPlanEntity saved = repository.save(entity);
        return mapper.toResponse(saved);
    }

    @Transactional
    public TopupPlanResponse update(String code, UpdateTopupPlanRequest request) {
        TopupPlanEntity entity = findEntity(code);
        validateSellablePlan(request.isActive(), request.getCredits(), request.getPriceThb());
        mapper.applyUpdate(entity, request);
        return mapper.toResponse(repository.save(entity));
    }

    @Transactional
    public TopupPlanResponse updateActive(String code, UpdateTopupPlanActiveRequest request) {
        TopupPlanEntity entity = findEntity(code);
        if (Boolean.TRUE.equals(request.getActive())) {
            validateSellablePlan(true, entity.getCredits(), entity.getPriceThb());
        }
        entity.setActive(request.getActive());
        return mapper.toResponse(repository.save(entity));
    }

    private TopupPlanEntity findEntity(String code) {
        return repository.findById(code.trim().toLowerCase())
                .orElseThrow(() -> new ResourceNotFoundException("Topup plan not found: " + code));
    }

    private void validateSellablePlan(boolean active, int credits, java.math.BigDecimal priceThb) {
        if (!active) {
            return;
        }
        if (credits <= 0) {
            throw new BusinessRuleException("Active topup plans must grant at least 1 credit");
        }
        if (priceThb == null || priceThb.compareTo(java.math.BigDecimal.ZERO) <= 0) {
            throw new BusinessRuleException("Active topup plans must have priceThb greater than 0");
        }
    }
}
