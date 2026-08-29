import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { VisitorImagesService } from './visitor-images.service';

@Module({
  imports: [DatabaseModule],
  providers: [VisitorImagesService],
  exports: [VisitorImagesService],
})
export class MediaModule {}
