package com.mosonic.payment.controller;

import com.mosonic.payment.common.ApiResponse;
import com.mosonic.payment.dto.CreateTopupPlanRequest;
import com.mosonic.payment.dto.TopupPlanResponse;
import com.mosonic.payment.dto.UpdateTopupPlanActiveRequest;
import com.mosonic.payment.dto.UpdateTopupPlanRequest;
import com.mosonic.payment.service.TopupPlanService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/topup-plans")
@RequiredArgsConstructor
@Tag(name = "Topup Plans")
public class TopupPlanController {

    private final TopupPlanService topupPlanService;

    @GetMapping
    @Operation(summary = "List topup plans")
    public ApiResponse<List<TopupPlanResponse>> list(
            @RequestParam(defaultValue = "true") boolean activeOnly) {
        return ApiResponse.ok(topupPlanService.list(activeOnly));
    }

    @GetMapping("/{code}")
    @Operation(summary = "Get a topup plan by code")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Plan not found")
    })
    public ApiResponse<TopupPlanResponse> get(@PathVariable String code) {
        return ApiResponse.ok(topupPlanService.getByCode(code));
    }

    @PostMapping
    @Operation(summary = "Create a topup plan")
    public ApiResponse<TopupPlanResponse> create(
            @RequestBody @Valid CreateTopupPlanRequest request,
            @RequestHeader(value = "X-Created-By", required = false) String createdBy) {
        return ApiResponse.ok(topupPlanService.create(request, createdBy));
    }

    @PutMapping("/{code}")
    @Operation(summary = "Update a topup plan")
    public ApiResponse<TopupPlanResponse> update(
            @PathVariable String code,
            @RequestBody @Valid UpdateTopupPlanRequest request) {
        return ApiResponse.ok(topupPlanService.update(code, request));
    }

    @PatchMapping("/{code}/active")
    @Operation(summary = "Enable or disable a topup plan")
    public ApiResponse<TopupPlanResponse> updateActive(
            @PathVariable String code,
            @RequestBody @Valid UpdateTopupPlanActiveRequest request) {
        return ApiResponse.ok(topupPlanService.updateActive(code, request));
    }
}
