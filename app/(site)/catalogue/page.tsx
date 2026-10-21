import type { Metadata } from "next";
import Link from "next/link";
import { showcaseModels } from "@/lib/showcase";

export const metadata: Metadata = { title: "Models" };

export default function CataloguePage() {
  const models = showcaseModels();
  return (
    <main className="site-wrap page-top">
      <p className="label">Catalogue</p>
      <h1 className="section-title">Every allowed model, with the price on it.</h1>
      <p className="lede">These are the text models Quiet can route. Prices are illustrative catalogue rates in pounds per million tokens. A workspace admin can disallow any of them.</p>
      <div className="table-wrap card">
        <table className="table">
          <thead>
            <tr><th>Model</th><th>Provider</th><th>Tier</th><th>Region</th><th>Input</th><th>Output</th><th>Sample</th></tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.slug}>
                <td>{model.name}</td>
                <td>{model.provider}</td>
                <td className="tier" data-tier={model.tier}>{model.tier}</td>
                <td className="mono">{model.region}</td>
                <td className="mono">{model.input}</td>
                <td className="mono">{model.output}</td>
                <td className="mono">{model.sample}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint">Input and output are per million tokens. Sample is 1,000 in and 200 out. <Link href="/models">Manage access in the control room</Link>.</p>
    </main>
  );
}
