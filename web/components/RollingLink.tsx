// SPDX-License-Identifier: Apache-2.0

import Link from "next/link";

export function RollingLink({
  href,
  children,
  className = "",
  style,
  onClick,
}: {
  href: string;
  children: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <Link href={href} className={`roll ${className}`} style={style} onClick={onClick}>
      <span className="roll-label">
        {children}
        {/* select-none keeps the visual duplicate out of copied text. */}
        <span aria-hidden className="roll-label-copy select-none">
          {children}
        </span>
      </span>
    </Link>
  );
}
