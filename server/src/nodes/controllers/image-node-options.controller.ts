import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ImageTemplateResolverService } from '../services/image-template-resolver.service';
import { ImageDesignStyleRepositoryService } from '../services/image-design-style-repository.service';

/**
 * Active template/style options (with images) for the `image_generation`
 * node config picker — any authenticated user, not admin-only.
 */
@UseGuards(JwtAuthGuard)
@Controller('nodes/image')
@ApiTags('Nodes')
@ApiBearerAuth('bearer')
export class ImageNodeOptionsController {
  constructor(
    private readonly templateResolver: ImageTemplateResolverService,
    private readonly styleRepository: ImageDesignStyleRepositoryService,
  ) {}

  @Get('templates')
  @ApiOperation({ summary: 'List active image templates for the node config picker' })
  listTemplates() {
    return this.templateResolver.listActiveForPicker();
  }

  @Get('styles')
  @ApiOperation({ summary: 'List active image design styles for the node config picker' })
  listStyles() {
    return this.styleRepository.listActive();
  }
}
