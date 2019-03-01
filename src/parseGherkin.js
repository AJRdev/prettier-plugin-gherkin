const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const readJsonLinesSync = require("read-json-lines-sync").default;

const buildGherkinDocument = text => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gherkin-parser"));
  const tmpFilePath = path.join(tmpDir, "tmp.feature");

  fs.writeFileSync(tmpFilePath, text, {
    encoding: "utf-8",
  });

  const { status, output } = spawnSync(
    `gherkin-javascript`,
    [/*"--no-source" , "--no-pickles", */ tmpFilePath],
    { encoding: "utf-8" },
  );

  fs.unlinkSync(tmpFilePath);

  if (status > 0) {
    throw new Error("Unable to parse the feature file");
  }

  const cleanedOutput = output.filter(oneLine => !!oneLine).toString();
  const resultDocuments = readJsonLinesSync(cleanedOutput);

  const attachementDocument = resultDocuments.find(
    oneDocument => !!oneDocument.attachment,
  );

  const gherkinDocument = resultDocuments.find(
    oneDocument => !!oneDocument.gherkinDocument,
  );

  if (!gherkinDocument && attachementDocument) {
    throw new Error(attachementDocument.attachment.data);
  }

  return gherkinDocument.gherkinDocument;
};

const buildAstTree = gherkinDocument => {
  const simplifiedAst = { ...gherkinDocument };
  delete simplifiedAst.uri;

  return simplifiedAst;
};

const isStepKeyword = keyword => {
  return ["given", "when", "then", "and"].includes(
    keyword.toLowerCase().trim(),
  );
};

const flattenAst = (nodes, oneNode) => {
  let result = [...nodes];

  if (oneNode.feature) {
    const feature = oneNode.feature;

    result.push({
      type: "feature",
      keyword: feature.keyword,
      name: feature.name || null,
      description: feature.description || null,
      language: feature.language,
      location: feature.location,
    });

    if (feature.children && feature.children.length > 0) {
      result = result.concat(...feature.children.reduce(flattenAst, []));
    }
  } else if (oneNode.scenario) {
    const scenario = oneNode.scenario;

    result.push({
      type: "scenario",
      keyword: scenario.keyword,
      name: scenario.name || null,
      description: scenario.description || null,
      location: scenario.location,
    });

    if (scenario.steps && scenario.steps.length > 0) {
      result = result.concat(...scenario.steps.reduce(flattenAst, []));
    }
  } else if (oneNode.keyword && isStepKeyword(oneNode.keyword)) {
    result.push({
      type: "step",
      keyword: oneNode.keyword,
      text: oneNode.text || null,
      location: oneNode.location,
    });
  } else {
    result.push({
      type: "unknown",
      ...oneNode,
    });
  }

  return result;
};

const parseGherkin = (text /*, parsers, options*/) => {
  const gherkinDocument = buildGherkinDocument(text);
  const astTree = buildAstTree(gherkinDocument);

  const flatAst = [astTree].reduce(flattenAst, []);

  return flatAst;
};

module.exports = parseGherkin;
