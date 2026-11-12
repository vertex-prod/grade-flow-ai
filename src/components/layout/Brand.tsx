import Link from 'next/link';

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="currentColor" />
      <path d="M44.3 23.4A15 15 0 1 0 47 32" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
      <path d="M34 32h13" fill="none" stroke="#f5a524" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function BrandName() {
  return <span className="brand-name">Grade<span>Flow</span><b>AI</b></span>;
}

export function Brand({ href, className = '' }: { href?: string; className?: string }) {
  const content = <><BrandMark /><BrandName /></>;
  const classes = `brand${className ? ` ${className}` : ''}`;
  return href
    ? <Link className={classes} href={href} aria-label="GradeFlow AI home">{content}</Link>
    : <div className={classes}>{content}</div>;
}
