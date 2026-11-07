import { toPng } from "html-to-image";

export async function downloadShareCard(node: HTMLElement, filename: string): Promise<void> {
  await document.fonts.ready;
  const dataUrl = await toPng(node, {
    width: 1080,
    height: 1440,
    pixelRatio: 1,
    backgroundColor: "#f8f7f4",
    style: { transform: "none" },
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
