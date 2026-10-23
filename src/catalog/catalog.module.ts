import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategory } from '@/catalog/entities/product-category.entity';
import { Product } from '@/catalog/entities/product.entity';
import { ProductCategoriesController } from '@/catalog/controllers/product-categories.controller';
import { ProductCategoriesService } from '@/catalog/services/product-categories.service';
import { ProductsController } from '@/catalog/controllers/products.controller';
import { ProductsService } from '@/catalog/services/products.service';

/** Products and product categories (read-only; editing comes with the admin). */
@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductCategory])],
  controllers: [ProductsController, ProductCategoriesController],
  providers: [ProductsService, ProductCategoriesService],
})
export class CatalogModule {}
