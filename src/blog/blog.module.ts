import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogCategory } from '@/blog/entities/blog-category.entity';
import { BlogPost } from '@/blog/entities/blog-post.entity';
import { BlogCategoriesController } from '@/blog/controllers/blog-categories.controller';
import { BlogCategoriesService } from '@/blog/services/blog-categories.service';
import { BlogPostsController } from '@/blog/controllers/blog-posts.controller';
import { BlogPostsService } from '@/blog/services/blog-posts.service';

/** Blog posts and their categories (read-only; editing comes with the admin). */
@Module({
  imports: [TypeOrmModule.forFeature([BlogPost, BlogCategory])],
  controllers: [BlogPostsController, BlogCategoriesController],
  providers: [BlogPostsService, BlogCategoriesService],
})
export class BlogModule {}
