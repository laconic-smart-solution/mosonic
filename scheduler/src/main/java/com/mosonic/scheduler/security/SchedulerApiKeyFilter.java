package com.mosonic.scheduler.security;

import com.mosonic.scheduler.config.SchedulerProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@RequiredArgsConstructor
public class SchedulerApiKeyFilter extends OncePerRequestFilter {

    public static final String API_KEY_HEADER = "X-Scheduler-API-Key";

    private final SchedulerProperties schedulerProperties;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/actuator");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        String configuredKey = schedulerProperties.getApiKey();
        if (configuredKey == null || configuredKey.isBlank()) {
            response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getOutputStream().write(
                    "{\"success\":false,\"message\":\"Scheduler API key is not configured\"}"
                            .getBytes(StandardCharsets.UTF_8));
            return;
        }

        String providedKey = request.getHeader(API_KEY_HEADER);
        if (!Objects.equals(configuredKey, providedKey)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getOutputStream()
                    .write("{\"success\":false,\"message\":\"Invalid API key\"}".getBytes(StandardCharsets.UTF_8));
            return;
        }

        filterChain.doFilter(request, response);
    }
}
