package com.mosonic.payment.config;

import com.mosonic.payment.domain.TopupPlanEntity;
import com.mosonic.payment.repository.TopupPlanRepository;
import java.math.BigDecimal;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class TopupPlanDataInitializer implements ApplicationRunner {

    private final TopupPlanRepository repository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (repository.count() > 0) {
            return;
        }

        repository.save(plan("starter", "Starter", 1000, "10.00", "350.00", 1));
        repository.save(plan("growth", "Growth", 5000, "45.00", "1575.00", 2));
        repository.save(plan("scale", "Scale", 10000, "80.00", "2800.00", 3));
    }

    private TopupPlanEntity plan(
            String code,
            String label,
            int credits,
            String priceUsd,
            String priceThb,
            int sortOrder) {
        TopupPlanEntity entity = new TopupPlanEntity();
        entity.setCode(code);
        entity.setLabel(label);
        entity.setCredits(credits);
        entity.setPriceUsd(new BigDecimal(priceUsd));
        entity.setPriceThb(new BigDecimal(priceThb));
        entity.setSortOrder(sortOrder);
        entity.setActive(true);
        return entity;
    }
}
