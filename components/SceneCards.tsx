import { Button } from "@/components/ui/button";

const SCENES = [
  { label: "租房", questions: ["房东不退押金怎么办？", "二房东收了钱跑了怎么办？", "房租占收入多少以内比较安全？"] },
  { label: "工作", questions: ["被裁了第一步做什么？", "试用期被辞退有补偿吗？", "想裸辞，社保医保怎么办？"] },
  { label: "钱", questions: ["朋友让我替他担保，签不签？", "网贷还不上怎么办？", "订阅太多怎么审计？"] },
  { label: "健康", questions: ["体检发现结节要不要手术？", "长期熬夜怎么补救？", "医保断缴有什么影响？"] },
  { label: "关系", questions: ["怎么判断这段关系好不好？", "结婚划不划算？", "分手后走不出来怎么办？"] },
  { label: "安全", questions: ["遇到电信诈骗怎么办？", "账号被盗了先做什么？", "出国旅行要准备什么？"] },
];

export function SceneCards({ onPick }: { onPick: (question: string) => void }) {
  return (
    <section className="scene-grid" aria-label="生活场景">
      {SCENES.map((scene) => (
        <article key={scene.label} className="scene-card">
          <h2>{scene.label}</h2>
          <div className="scene-questions">
            {scene.questions.map((question) => (
              <Button key={question} variant="ghost" className="scene-question" onClick={() => onPick(question)}>
                {question}
              </Button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
