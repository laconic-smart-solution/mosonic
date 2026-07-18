package com.mosonic.scheduler.service;

import com.mosonic.scheduler.config.SchedulerProperties;
import com.mosonic.scheduler.dto.SchedulerDispatchMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
@Slf4j
public class SchedulerRedisPublisher {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final SchedulerProperties properties;

    public void publish(SchedulerDispatchMessage message) {
        try {
            String payload = objectMapper.writeValueAsString(message);
            redisTemplate.convertAndSend(properties.getRedisChannel(), payload);
            log.info(
                    "Published scheduler event type={} refId={} jobId={}",
                    message.eventType(),
                    message.refId(),
                    message.jobId());
        } catch (JacksonException e) {
            throw new IllegalStateException("Failed to serialize scheduler dispatch message", e);
        }
    }
}
