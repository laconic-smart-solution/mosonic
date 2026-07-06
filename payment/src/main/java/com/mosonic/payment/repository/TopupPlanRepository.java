package com.mosonic.payment.repository;

import com.mosonic.payment.domain.TopupPlanEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TopupPlanRepository extends JpaRepository<TopupPlanEntity, String> {

    List<TopupPlanEntity> findAllByActiveTrueOrderBySortOrderAscCodeAsc();

    List<TopupPlanEntity> findAllByOrderBySortOrderAscCodeAsc();
}
