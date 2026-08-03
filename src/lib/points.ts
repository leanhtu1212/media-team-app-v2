import type { ProductType } from '../types';

/**
 * Danh mục loại sản phẩm mặc định (chỉ dùng làm nhãn phân loại project —
 * hệ thống tính điểm đã được gỡ bỏ, field `points` giữ lại cho tương thích dữ liệu cũ).
 */
export const DEFAULT_PRODUCT_TYPES: Omit<ProductType, 'id'>[] = [
  { name: 'Ảnh nền trắng', points: 0, category: 'Ảnh' },
  { name: 'Ảnh Model', points: 0, category: 'Ảnh' },
  { name: 'Ảnh Flatlay', points: 0, category: 'Ảnh' },
  { name: 'Ảnh Campaign', points: 0, category: 'Ảnh' },
  { name: 'Ảnh Sự kiện', points: 0, category: 'Ảnh' },
  { name: 'Video Content', points: 0, category: 'Video' },
  { name: 'Video Model', points: 0, category: 'Video' },
  { name: 'Video Sự kiện', points: 0, category: 'Video' },
  { name: 'Video Ecom', points: 0, category: 'Video' },
  { name: 'Video Model Xịn', points: 0, category: 'Video' },
  { name: 'Ảnh Outsource', points: 0, category: 'Outsource' },
  { name: 'Video Outsource', points: 0, category: 'Outsource' },
  { name: 'Hợp đồng', points: 0, category: 'Outsource' },
];
