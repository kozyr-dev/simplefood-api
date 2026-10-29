import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogCategory } from './entities/blog-category.entity';
import { BlogPost } from './entities/blog-post.entity';
import { BlogCategoriesController } from './controllers/blog-categories.controller';
import { BlogCategoriesService } from './services/blog-categories.service';
import { BlogPostsController } from './controllers/blog-posts.controller';
import { BlogPostsService } from './services/blog-posts.service';

/** Blog posts and their categories (read-only; editing comes with the admin). */
@Module({
  imports: [TypeOrmModule.forFeature([BlogPost, BlogCategory])],
  controllers: [BlogPostsController, BlogCategoriesController],
  providers: [BlogPostsService, BlogCategoriesService],
})
export class BlogModule {}
