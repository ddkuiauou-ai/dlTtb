import React from 'react';
import { brands } from '@/lib/brands';

interface BrandIconProps extends React.SVGAttributes<SVGElement> {
  name: keyof typeof brands;
  useBrandColor?: boolean;
}

export function BrandIcon({ name, useBrandColor = false, ...props }: BrandIconProps) {
  const brand = brands[name];

  if (!brand) {
    return null; // 혹은 기본 아이콘을 보여줄 수 있습니다.
  }

  return (
    <svg
      {...props}
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill={useBrandColor ? brand.color : 'currentColor'}
    >
      <title>{brand.title}</title>
      <path d={brand.path} />
    </svg>
  );
}
