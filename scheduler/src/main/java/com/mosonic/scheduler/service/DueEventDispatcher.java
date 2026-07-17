package com.mosonic.scheduler.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class DueEventDispatcher {

    private final ScheduledEventService scheduledEventService;

    @Scheduled(fixedDelayString = "${scheduler.poll-interval-ms:5000}")
    public void pollDueEvents() {
        int count = scheduledEventService.dispatchDue();
        if (count > 0) {
            log.info("Dispatched {} due scheduled event(s)", count);
        }
    }
}
