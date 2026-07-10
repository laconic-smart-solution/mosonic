export const UPLOAD_CHANNELS = [
  { id: "fb", label: "Facebook", icon: "f", color: "#1877F2", status: "pending", aspect: "1.91:1", text: "Songkran สุขสันต์! 🎉 ช้อปเลยวันนี้ รับส่วนลดสูงสุด 50% ฉลองเทศกาลน้ำกับเรา!", charLimit: null as number | null, charCount: null as number | null },
  { id: "ig", label: "Instagram", icon: "◎", color: "#E1306C", status: "scheduled", aspect: "4:5", text: "Songkran สุขสันต์! 🎉 ช้อปเลยวันนี้ รับส่วนลด 50% #Songkran2026 #สงกรานต์", charLimit: null, charCount: null },
  { id: "ln", label: "LINE", icon: "▲", color: "#06C755", status: "pending", aspect: "1:1", text: "สวัสดีครับ! Songkran นี้ช้อปที่เราได้เลย รับส่วนลดทันที ✨", charLimit: null, charCount: null },
] as const

export const UPLOAD_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "gray" },
  scheduled: { label: "Scheduled", color: "indigo" },
  published: { label: "Published", color: "green" },
  failed: { label: "Failed", color: "red" },
}
