import axios from 'axios';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { mapSsoAxiosError } from './sso-error.mapper';

function axiosError(status: number, data: unknown) {
  return new axios.AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status,
      data,
      statusText: String(status),
      headers: {},
      config: {} as never,
    },
  );
}

describe('mapSsoAxiosError', () => {
  it('maps login 401 to InvalidCredentials', () => {
    try {
      mapSsoAxiosError(axiosError(401, { message: 'bad password' }), 'login');
      fail('Expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      const body = (err as UnauthorizedException).getResponse() as {
        error?: string;
        statusCode?: number;
      };
      expect(body.statusCode).toBe(401);
      expect(body.error).toBe('InvalidCredentials');
    }
  });

  it('maps signup 409 to Conflict', () => {
    try {
      mapSsoAxiosError(axiosError(409, { message: 'duplicate' }), 'signup');
      fail('Expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      const body = (err as ConflictException).getResponse() as {
        error?: string;
      };
      expect(body.error).toBe('Conflict');
    }
  });

  it('maps otp failures to InvalidOtp', () => {
    try {
      mapSsoAxiosError(axiosError(400, { message: 'invalid otp' }), 'otp');
      fail('Expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as {
        error?: string;
        statusCode?: number;
      };
      expect(body.statusCode).toBe(400);
      expect(body.error).toBe('InvalidOtp');
    }
  });

  it('maps network errors to AuthServiceUnavailable', () => {
    const err = new axios.AxiosError('Network Error', 'ERR_NETWORK');
    try {
      mapSsoAxiosError(err, 'login');
      fail('Expected throw');
    } catch (mapped) {
      expect(mapped).toBeInstanceOf(BadGatewayException);
      const body = (mapped as BadGatewayException).getResponse() as {
        error?: string;
      };
      expect(body.error).toBe('AuthServiceUnavailable');
    }
  });
});
