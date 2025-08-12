import { title, subtitle } from "@/components/primitives";

export default function Home() {
  return (
    <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
      <div className="inline-block max-w-xl text-center justify-center">
        <span className={title()}>Howdy! I'm Austin&nbsp;</span>
        <br />
        <div className={subtitle({ class: "mt-4" })}>
          ...this is where I want to put the text for my description...
        </div>
      </div>
    </section>
  );
}
