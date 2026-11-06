import type { OrderDto, OrderItemDto } from '../dto/order.dto';
import type { OrderItem } from '../entities/order-item.entity';
import type { Order } from '../entities/order.entity';

/** Field by field, so a new column never reaches a response by accident. */
export function toOrderItemDto(item: OrderItem): OrderItemDto {
  return {
    productId: item.productId,
    title: item.title,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
  };
}

/**
 * `items` come out in position order, whatever order they're passed in.
 * Never the owner (`user`): the caller is the owner, or a guest who just
 * placed it.
 */
export function toOrderDto(order: Order, items: OrderItem[]): OrderDto {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    shippingMethod: order.shippingMethod,
    name: order.name,
    email: order.email,
    phone: order.phone,
    address: order.address,
    comments: order.comments,
    subtotal: order.subtotal,
    items: [...items]
      .sort((a, b) => a.position - b.position)
      .map(toOrderItemDto),
    legacyItemsText: order.legacyDishesText,
    createdAt: order.createdAt,
  };
}
