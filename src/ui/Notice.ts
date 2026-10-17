export function buildNotice(title: string, text: string): HTMLElement {
  const notice = document.createElement("div");
  notice.classList.add("LyricsNotice");
  const heading = document.createElement("div");
  heading.classList.add("NoticeTitle");
  heading.textContent = title;
  const body = document.createElement("div");
  body.classList.add("NoticeText");
  body.textContent = text;
  notice.append(heading, body);
  return notice;
}
