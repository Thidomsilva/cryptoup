import type { SVGProps } from 'react';

export function CoinbaseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Zm-1,5h2a3,3,0,0,1,3,3v4a3,3,0,0,1-3,3h-2a3,3,0,0,1-3-3V10a3,3,0,0,1,3-3Z" />
    </svg>
  );
}
