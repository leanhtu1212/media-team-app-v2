import { useEffect, useState } from 'react';

/** Ngưỡng mobile — trùng với breakpoint `md` của Tailwind (768px) để CSS và JS
 *  luôn đổi layout cùng một lúc. Đổi ở đây thì nhớ đổi cả các class `md:` tương ứng. */
export const MOBILE_MAX_WIDTH = 767;

/** `true` khi màn hình hẹp cỡ điện thoại.
 *  Chỉ dùng khi mobile cần CÂY COMPONENT KHÁC (vd Lịch tháng: lưới 7 cột ↔ danh sách theo ngày).
 *  Chỉ đổi cách sắp xếp/ẩn hiện thì dùng class `md:` của Tailwind, đỡ phải render 2 lần. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    onChange(); // đồng bộ lại phòng khi kích thước đổi giữa render đầu và effect
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
