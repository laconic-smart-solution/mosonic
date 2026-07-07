package com.mosonic.payment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mosonic.payment.common.BusinessRuleException;
import com.mosonic.payment.common.ResourceNotFoundException;
import com.mosonic.payment.domain.TopupPlanEntity;
import com.mosonic.payment.dto.CreateTopupPlanRequest;
import com.mosonic.payment.dto.TopupPlanResponse;
import com.mosonic.payment.dto.UpdateTopupPlanActiveRequest;
import com.mosonic.payment.mapper.TopupPlanMapper;
import com.mosonic.payment.repository.TopupPlanRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TopupPlanServiceTest {

    @Mock
    private TopupPlanRepository repository;

    private TopupPlanService service;

    @BeforeEach
    void setUp() {
        service = new TopupPlanService(repository, new TopupPlanMapper());
    }

    @Test
    void createRejectsDuplicateCode() {
        CreateTopupPlanRequest request = new CreateTopupPlanRequest();
        request.setCode("starter");
        request.setLabel("Starter");
        request.setCredits(1000);
        request.setPriceUsd(new BigDecimal("10.00"));
        request.setPriceThb(new BigDecimal("350.00"));

        when(repository.existsById("starter")).thenReturn(true);

        assertThatThrownBy(() -> service.create(request, "admin"))
                .isInstanceOf(BusinessRuleException.class);
    }

    @Test
    void listActivePlans() {
        TopupPlanEntity entity = sampleEntity();
        when(repository.findAllByActiveTrueOrderBySortOrderAscCodeAsc()).thenReturn(List.of(entity));

        List<TopupPlanResponse> plans = service.list(true);

        assertThat(plans).hasSize(1);
        assertThat(plans.getFirst().code()).isEqualTo("starter");
    }

    @Test
    void updateActiveToggle() {
        TopupPlanEntity entity = sampleEntity();
        when(repository.findById("starter")).thenReturn(Optional.of(entity));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        UpdateTopupPlanActiveRequest request = new UpdateTopupPlanActiveRequest();
        request.setActive(false);

        TopupPlanResponse response = service.updateActive("starter", request);

        assertThat(response.active()).isFalse();
        verify(repository).save(entity);
    }

    @Test
    void getMissingPlanThrows() {
        when(repository.findById("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getByCode("missing"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    private TopupPlanEntity sampleEntity() {
        TopupPlanEntity entity = new TopupPlanEntity();
        entity.setCode("starter");
        entity.setLabel("Starter");
        entity.setCredits(1000);
        entity.setPriceUsd(new BigDecimal("10.00"));
        entity.setPriceThb(new BigDecimal("350.00"));
        entity.setSortOrder(1);
        entity.setActive(true);
        entity.setCreatedAt(Instant.now());
        entity.setUpdatedAt(Instant.now());
        return entity;
    }
}
