import { Client } from 'langsmith';
import fs from 'fs/promises';
import path from 'path';

const client = new Client();
const GOLDEN_DIR = path.join(__dirname, 'golden');

async function main() {
    await fs.mkdir(GOLDEN_DIR, { recursive: true });

    const datasets = ['diagnosis-eval', 'proposal-eval', 'adversarial-eval'];

    for (const name of datasets) {
        let dataset;
        try {
            if (await client.hasDataset({ datasetName: name })) {
                console.log(`Dataset ${name} already exists.`);
            } else {
                dataset = await client.createDataset(name, { description: `${name} testing golden dataset` });
                console.log(`Created dataset: ${name}`);
            }
        } catch (err: any) {
            console.warn(`Creating dataset ${name} failed:`, err.message);
        }
    }

    try {
        const runs = await client.listRuns({
            projectName: process.env.LANGSMITH_PROJECT || 'proposal-engine',
            runType: 'chain',
            error: false,
            limit: 20
        });

        const traces = [];
        for await (const run of runs) {
            traces.push({
                id: run.id,
                inputs: run.inputs,
                outputs: run.outputs,
                latency: run.end_time && run.start_time ? run.end_time - run.start_time : 0,
                tokens: run.total_tokens
            });
        }

        await fs.writeFile(
            path.join(GOLDEN_DIR, 'latest-traces.json'),
            JSON.stringify(traces, null, 2)
        );
        console.log(`Saved ${traces.length} production traces as golden examples.`);

    } catch (err) {
        console.error('Failed to list production runs. Make sure LANGSMITH_API_KEY is set.');
    }
}

main().catch(console.error);
