import type { SVGProps } from "react"

function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width="100"
      height="100"
      role="img"
      aria-label="Mosonic icon"
      {...props}
    >
      <title>Mosonic icon</title>
      <desc>Clustered bamboo grove: three rising segmented stalks with a leaf.</desc>
      <rect x="20" y="50" width="15" height="40" rx="6" fill="#0F1F3D" opacity="0.45" />
      <line x1="20" y1="71" x2="35" y2="71" stroke="#F7F4EF" strokeWidth="2" />
      <rect x="63" y="41" width="15" height="49" rx="6" fill="#0F1F3D" opacity="0.82" />
      <line x1="63" y1="65" x2="78" y2="65" stroke="#F7F4EF" strokeWidth="2" />
      <rect x="41" y="22" width="17" height="68" rx="7" fill="#00C9A7" />
      <line x1="41" y1="47" x2="58" y2="47" stroke="#F7F4EF" strokeWidth="2.4" />
      <line x1="41" y1="70" x2="58" y2="70" stroke="#F7F4EF" strokeWidth="2.4" />
      <path d="M49 24 Q68 2 96 8 Q72 20 50 24 Z" fill="#F5A623" />
    </svg>
  )
}

export default Logo
