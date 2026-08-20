const I = ({ children, size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

export const CheckIcon = (p) => <I {...p}><path d="M20 6 9 17l-5-5" /></I>;
export const ReplyIcon = (p) => <I {...p}><path d="M9 17l-5-5 5-5" /><path d="M4 12h9a7 7 0 0 1 7 7v1" /></I>;
export const EyeOffIcon = (p) => (
  <I {...p}>
    <path d="M10.7 5.1A9.8 9.8 0 0 1 12 5c7 0 10 7 10 7a15.6 15.6 0 0 1-2.2 3.2" />
    <path d="M6.6 6.6A15 15 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M2 2l20 20" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </I>
);
export const EyeIcon = (p) => <I {...p}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></I>;
export const TrashIcon = (p) => <I {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></I>;
export const BanIcon = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></I>;
export const ThumbIcon = (p) => <I {...p}><path d="M7 10v11" /><path d="M7 11l4.2-8a2.4 2.4 0 0 1 2.3 2.4V9h4.6a2 2 0 0 1 2 2.4l-1.2 7a2 2 0 0 1-2 1.6H7" /></I>;
export const RefreshIcon = (p) => <I {...p}><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 3v6h-6" /></I>;
export const SearchIcon = (p) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></I>;
export const ExternalIcon = (p) => <I {...p}><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" /></I>;
export const InboxIcon = (p) => <I {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z" /></I>;
export const SparkIcon = (p) => <I {...p}><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></I>;
export const GearIcon = (p) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" /></I>;
export const ShieldIcon = (p) => <I {...p}><path d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10Z" /></I>;
export const ClockIcon = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></I>;
export const BookmarkIcon = (p) => <I {...p}><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" /></I>;
export const SquareCheckIcon = (p) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m8.5 12 2.5 2.5L16 9" /></I>;
