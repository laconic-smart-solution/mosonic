import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { EventAppClientService } from './event-app-client.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EventAppClientService', () => {
  let service: EventAppClientService;
  let config: ConfigService;
  let mockHttp: { post: jest.Mock };

  beforeEach(() => {
    mockHttp = {
      post: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockHttp as never);

    config = new ConfigService({
      EVENT_BACKEND_URL: 'http://localhost:8080',
      EVENT_APP_INTERNAL_API_KEY: 'test-secret-key',
    });

    service = new EventAppClientService(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('validates exchange code successfully', async () => {
    const mockResponse = {
      data: {
        success: true,
        data: {
          valid: true,
          email: 'organizer@example.com',
          name: 'Ada Lovelace',
          organizationId: 100,
          role: 'ORGANIZATION_OWNER',
          redirectPath: '/dashboard',
        },
      },
    };
    mockHttp.post.mockResolvedValueOnce(mockResponse);

    const result = await service.validateExchangeCode('valid-code-123');

    expect(mockHttp.post).toHaveBeenCalledWith(
      'http://localhost:8080/v1/internal/mosonic/validate-code',
      { code: 'valid-code-123' },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Mosonic-Api-Key': 'test-secret-key',
        },
      },
    );
    expect(result.email).toBe('organizer@example.com');
    expect(result.valid).toBe(true);
  });

  it('throws BadRequestException if code is empty', async () => {
    await expect(service.validateExchangeCode('')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws UnauthorizedException if Event App returns error', async () => {
    const axiosError = new axios.AxiosError(
      'Unauthorized',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 401,
        data: { message: 'Invalid or expired code' },
        statusText: 'Unauthorized',
        headers: {},
        config: {} as never,
      },
    );
    mockedAxios.isAxiosError.mockReturnValueOnce(true);
    mockHttp.post.mockRejectedValueOnce(axiosError);

    await expect(service.validateExchangeCode('bad-code')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
