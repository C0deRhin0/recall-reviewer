import type { ReactNode } from "react";

const paths = {
  back: <path d="m10 5-6 7 6 7M4 12h16" />,
  next: <path d="m14 5 6 7-6 7M4 12h16" />,
  bookmark: <path d="M6 4h12v17l-6-4-6 4V4Z" />,
  flag: <path d="M5 21V4m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0" />,
  review: (
    <>
      <path d="M9 5h11M9 12h11M9 19h11m-17-7 1 1 2-3M3 19l1 1 2-3" />
      <circle cx="4.5" cy="5" r="1" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  uncertain: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3h.01" />
    </>
  ),
  report: (
    <>
      <path d="m12 3 10 18H2L12 3Z" />
      <path d="M12 9v5m0 3h.01" />
    </>
  ),
  chevron: <path d="m8 10 4 4 4-4" />,
  time: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M9 2h6m-3 3v-3m0 7v5l3 2" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export default function StudyIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="study-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
// Align local documentation for studyicon module
// Review follow-up details for studyicon module
