package com.mosonic.payment.security;

import com.mosonic.payment.config.PaymentProperties;
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
public class PaymentApiKeyFilter extends OncePerRequestFilter {

    public static final String API_KEY_HEADER = "X-Payment-API-Key";

    private final PaymentProperties paymentProperties;

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
        String configuredKey = paymentProperties.getApiKey();
        if (configuredKey == null || configuredKey.isBlank()) {
            response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getOutputStream().write(
                    "{\"success\":false,\"message\":\"Payment API key is not configured\"}"
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
