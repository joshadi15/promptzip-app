interface LogoMarkProps {
  className?: string;
}

/** PromptZip's compression mark: two open forms converge without becoming a zipper. */
export function LogoMark({ className = 'h-8 w-8' }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 4.5 27.5 15v6.5L12 14.7v18.6l15.5-6.8V33L4 43.5V4.5Z"
        className="fill-blue-600 dark:fill-blue-400"
      />
      <path
        d="M44 6.5 29 14v7.2l8-3.5v12.6l-8-3.5V34l15 7.5v-35Z"
        className="fill-teal-500 dark:fill-teal-300"
      />
    </svg>
  );
}
