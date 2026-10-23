import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategory } from './entities/product-category.entity';
import { Product } from './entities/product.entity';
import { ProductCategoriesController } from './product-categories.controller';
import { ProductCategoriesService } from './product-categories.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/** Products and product categories (read-only; editing comes with the admin). */
@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductCategory])],
  controllers: [ProductsController, ProductCategoriesController],
  providers: [ProductsService, ProductCategoriesService],
})
export class CatalogModule {}
