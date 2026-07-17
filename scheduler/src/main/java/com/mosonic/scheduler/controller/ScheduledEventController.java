package com.mosonic.scheduler.controller;

import com.mosonic.scheduler.common.ApiResponse;
import com.mosonic.scheduler.common.aspect.Loggable;
import com.mosonic.scheduler.domain.ScheduleEventType;
import com.mosonic.scheduler.dto.CreateScheduledEventRequest;
import com.mosonic.scheduler.dto.RescheduleEventRequest;
import com.mosonic.scheduler.dto.ScheduledEventResponse;
import com.mosonic.scheduler.service.ScheduledEventService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/events")
@RequiredArgsConstructor
@Loggable
public class ScheduledEventController {

    private final ScheduledEventService scheduledEventService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ScheduledEventResponse> create(@Valid @RequestBody CreateScheduledEventRequest request) {
        return ApiResponse.ok(scheduledEventService.create(request));
    }

    @PutMapping("/{eventType}/{refId}")
    public ApiResponse<ScheduledEventResponse> reschedule(
            @PathVariable ScheduleEventType eventType,
            @PathVariable String refId,
            @Valid @RequestBody RescheduleEventRequest request) {
        return ApiResponse.ok(scheduledEventService.reschedule(eventType, refId, request));
    }

    @DeleteMapping("/{eventType}/{refId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(
            @PathVariable ScheduleEventType eventType,
            @PathVariable String refId) {
        scheduledEventService.cancel(eventType, refId);
    }
}
