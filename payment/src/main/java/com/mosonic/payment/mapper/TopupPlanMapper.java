package com.mosonic.payment.mapper;

import com.mosonic.payment.domain.TopupPlanEntity;
import com.mosonic.payment.dto.CreateTopupPlanRequest;
import com.mosonic.payment.dto.TopupPlanResponse;
import com.mosonic.payment.dto.UpdateTopupPlanRequest;
import org.springframework.stereotype.Component;

@Component
public class TopupPlanMapper {

    public TopupPlanResponse toResponse(TopupPlanEntity entity) {
        return new TopupPlanResponse(
                entity.getCode(),
                entity.getLabel(),
                entity.getCredits(),
                entity.getPriceUsd(),
                entity.getPriceThb(),
                entity.getSortOrder(),
                Boolean.TRUE.equals(entity.getActive()),
                entity.getCreatedAt(),
                entity.getUpdatedAt());
    }

    public TopupPlanEntity toEntity(CreateTopupPlanRequest request) {
        TopupPlanEntity entity = new TopupPlanEntity();
        entity.setCode(request.getCode().trim().toLowerCase());
        applyMutableFields(entity, request.getLabel(), request.getCredits(), request.getPriceUsd(),
                request.getPriceThb(), request.getSortOrder(), request.isActive());
        return entity;
    }

    public void applyUpdate(TopupPlanEntity entity, UpdateTopupPlanRequest request) {
        applyMutableFields(entity, request.getLabel(), request.getCredits(), request.getPriceUsd(),
                request.getPriceThb(), request.getSortOrder(), request.isActive());
    }

    private void applyMutableFields(
            TopupPlanEntity entity,
            String label,
            int credits,
            java.math.BigDecimal priceUsd,
            java.math.BigDecimal priceThb,
            int sortOrder,
            boolean active) {
        entity.setLabel(label.trim());
        entity.setCredits(credits);
        entity.setPriceUsd(priceUsd);
        entity.setPriceThb(priceThb);
        entity.setSortOrder(sortOrder);
        entity.setActive(active);
    }
}
