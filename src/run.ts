#!/usr/bin/env ts-node

import fs = require("fs");
import os = require("os");

import commandLineArgs = require("command-line-args");
import commandLineUsage = require("command-line-usage");
import mime = require("mime-types");
import sha256 = require("crypto-js/sha256");

import got from "got";

import * as action from "./action";
import * as contract from "./contract";
import * as ipfs from "./ipfs";
import * as license from "./license";
import * as nit from "./nit";

const launch = require("launch-editor");

/*----------------------------------------------------------------------------
 * Configuration
 *----------------------------------------------------------------------------*/
const configFilepath = `${os.homedir()}/.nitconfig.json`;
const workingDir = `.nit`;

async function setWorkingAssetCid(assetCid: string) {
  if (fs.existsSync(`${workingDir}`) === false) {
    console.log(`Create working dir ${workingDir}`);
    fs.mkdirSync(`${workingDir}`);
  } else {
    // working dir exists
  }
  fs.writeFileSync(`${workingDir}/working.json`, JSON.stringify({"assetCid": assetCid}, null, 2));
}

async function getWorkingAssetCid() {
  const workingConfig = JSON.parse(fs.readFileSync(`${workingDir}/working.json`, "utf-8"));
  return workingConfig.assetCid;
}

async function loadConfig() {
  const config = JSON.parse(fs.readFileSync(`${configFilepath}`, "utf-8"));
  return config;
}

async function writeConfig(configData: Object) {
  const nitconfig = `${configFilepath}`;
  if (fs.existsSync(nitconfig) === false) {
    fs.writeFileSync(nitconfig,
                     JSON.stringify(configData, null, 2),
                     { flag: "wx+" });
  } else {
    console.warn(`Nit config ${nitconfig} exists.`);
  }
}

/*----------------------------------------------------------------------------
 * I/O
 *----------------------------------------------------------------------------*/
async function stage(assetCid, stagedAssetTree, stagedCommit) {
  // Create staged dir whose name is assetCid
  const commitDir = `${workingDir}/${assetCid}`;
  if (fs.existsSync(commitDir) === false) {
    fs.mkdirSync(commitDir);
  } else {}

  fs.writeFileSync(`${commitDir}/assetTree.json`, JSON.stringify(stagedAssetTree, null, 2));
  fs.writeFileSync(`${commitDir}/commit.json`, JSON.stringify(stagedCommit, null, 2));
  await setWorkingAssetCid(assetCid);
}

async function getStagedCommit(assetCid) {
  return JSON.parse(fs.readFileSync(`${workingDir}/${assetCid}/commit.json`, "utf-8"));
}

async function getStagedAssetTree(assetCid) {
  return JSON.parse(fs.readFileSync(`${workingDir}/${assetCid}/assetTree.json`, "utf-8"));
}

/*----------------------------------------------------------------------------
 * CLI Usage
 *----------------------------------------------------------------------------*/
async function help() {
  const logo = `
    ████████████████████████████████████
    ████████████████████████████████████
    ████████████████████████████████████
    ████████████████████████████████████
    ████████▀▀▀▀▀▀████████▀▀▀▀▀▀████████
    ████████    ▄█▌ ▀████▌      ████████
    ████████  Φ███▌   ▀██▌      ████████
    ████████   ╙▀█▌     ╙▀      ████████
    ████████      L      ▐█▄    ████████
    ████████      ▐█▄    ▐███▄  ████████
    ████████      ▐███▄  ▐██▀   ████████
    ████████      ▐██████▄▀     ████████
    ████████████████████████████████████
    ████████████████████████████████████
    ████████████████████████████████████
    ████████████████████████████████████
    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
  `;
  const sections = [
    {
      content: logo,
      raw: true
    },
    {
      header: "Available Commands",
      content: [
        "init      Initialize working environment",
        "config    Edit Nit configuration",
        "add       Add assetTree",
        "status    Show current temporary commit",
        "commit    Generate and register commit to web3",
        "verify    Verify integrity signature",
        "log       Show asset's commits",
        "help      Show this usage tips",
      ]
    },
    {
      header: 'init',
      content: [
        "$ nit init",
      ]
    },
    {
      header: 'config',
      content: [
        "$ nit config -e|--edit",
        "$ nit config -l|--list",
      ]
    },
    {
      header: 'add',
      content: [
        "$ nit add {underline assetFilepath} -m|--message {underline abstract} --nft-record-cid {underline cid} --integrity-cid {underline cid}",
      ]
    },
    {
      header: 'addv1',
      content: [
        "$ nit addv1 {underline assetTreeFilepath}",
      ]
    },
    {
      header: 'status',
      content: [
        "$ nit status",
      ]
    },
    {
      header: 'commit',
      content: [
        "$ nit commit -m|--message {underline abstract} -a|--action {underline action} -r|--action-result {underline actionResult}",
        "$ nit commit -m|--message {underline abstract} -a|--action {underline action} -r|--action-result {underline actionResult} --dry-run",
        "$ nit commit -m|--message {underline abstract} -a|--action {underline action} -r|--action-result {underline actionResult} --mockup",
      ]
    },
    {
      header: 'commit options',
      optionList: [
        {
          "name": "message",
          "description": 'Discription of this commit. The message will be in the "abstract" field in a Commit.',
          "alias": "m",
          "typeLabel": "{underline commit-description}"
        },
        {
          "name": "action",
          "description": '(Under-development) The action happened on the targeting ditigal asset (addressed by Asset CID). The message will be in the "action" field in a Commit. You can put arbitrary value currently.',
          "alias": "a",
          "typeLabel": "{underline commit-description}"
        },
        {
          "name": "action-result",
          "description": '(Under-development) The execution result of the action. The message will be in the "actionResult" field in a Commit. You can put arbitrary value currently.',
          "alias": "r",
          "typeLabel": "{underline commit-description}"
        },
        {
          "name": "dry-run",
          "description": "Only show the Commit content and will not commit to blockchain. The added Asset Tree will not be cleaned."
        },
        {
          "name": "mockup",
          "description": "Use Asset CID mockup (59 'a' chars) as Commit's targeting digital asset."
        },
      ]
    },
    {
      header: 'verify',
      content: [
        "$ nit verify -i|--integrity-hash {underline integrityHash} -s|--signature {underline signature}",
      ]
    },
    {
      header: 'log',
      content: [
        "$ nit log {underline assetCid}",
      ]
    },
  ]
  const usage = commandLineUsage(sections)
  console.log(usage)
}

async function parseArgs() {
  const commandDefinitions = [
    { name: "command", defaultOption: true },
  ];
  const commandOptions = commandLineArgs(commandDefinitions,
                                         { stopAtFirstUnknown: true });
  const argv = commandOptions._unknown || [];

  if (commandOptions.command === "ipfsadd") {
    const paramDefinitions = [
      { name: "filepath", defaultOption: true },
    ];
    const paramOptions = commandLineArgs(paramDefinitions,
                                         { argv, stopAtFirstUnknown: true });
    return {
      "command": "ipfsadd",
      "params": {
        "fileapth": paramOptions.filepath,
      }
    }
  } else if (commandOptions.command === "init") {
    return {
      "command": "init",
      "params": {}
    }
  } else if (commandOptions.command === "addv1") {
    const paramDefinitions = [
      { name: "filepath", defaultOption: true },
    ];
    const paramOptions = commandLineArgs(paramDefinitions,
                                         { argv, stopAtFirstUnknown: true });
    return {
      "command": "addv1",
      "params": {
        "filepath": paramOptions.filepath,
      }
    };
  } else if (commandOptions.command === "add") {
    const paramDefinitions = [
      { name: "filepath", defaultOption: true },
      { name: "message", alias: "m" },
      { name: "nft-record-cid" },
      { name: "integrity-cid" },
      { name: "mockup" },
    ];
    const paramOptions = commandLineArgs(paramDefinitions,
                                         { argv, stopAtFirstUnknown: true });
    return {
      "command": commandOptions.command,
      "params": paramOptions
    };
  } else if (commandOptions.command === "commit") {
    const paramDefinitions = [
      { name: "message", alias: "m" },
      { name: "action", alias: "a" },
      { name: "action-result", alias: "r" },
      { name: "dry-run" },
      { name: "mockup" },
    ];
    const paramOptions = commandLineArgs(paramDefinitions, { argv });
    return {
      "command": commandOptions.command,
      "params": paramOptions
    }
  } else if (commandOptions.command === "status") {
    return {
      "command": "status",
      "params": {}
    }
  } else if (commandOptions.command === "verify") {
    const paramDefinitions = [
      { name: "integrity-hash", alias: "i" },
      { name: "signature", alias: "s" },
    ];
    const paramOptions = commandLineArgs(paramDefinitions, { argv });
    return {
      "command": "verify",
      "params": paramOptions
    }
  } else if (commandOptions.command === "log") {
    const paramDefinitions = [
      { name: "asset-cid", defaultOption: true },
    ];
    const paramOptions = commandLineArgs(paramDefinitions,
                                         { argv, stopAtFirstUnknown: true });
    return {
      "command": "log",
      "params": {
        "asset-cid": paramOptions["asset-cid"],
      }
    }
  } else if (commandOptions.command === "config") {
    const paramDefinitions = [
      { name: "edit", alias: "e" },
      { name: "list", alias: "l" },
    ];
    const paramOptions = commandLineArgs(paramDefinitions, { argv });
    return {
      "command": "config",
      "params": paramOptions
    }
  } else {
    return {
      "command": "help",
      "params": {}
    }
  }
}

async function assetSourceToBytes(source) {
  console.log("call assetSourceToBytes");
  let assetBytes;
  if (source.substring(0, 4) === "bafy") {
    console.log("source cid");
    assetBytes = await ipfs.infuraIpfsCat(source);
  } else if (source.substring(0, 4) === "http") {
    console.log("source http");
    assetBytes = (await got.get(source, { timeout: { request: 30000 } })).rawBody;
  } else {
    console.log("source filepath");
    assetBytes = fs.readFileSync(source);
  }
  console.log(`${assetBytes.length}`);
  return assetBytes;
}

async function getMimetypeFromBytes(bytes) {
  /* The mime-types module relies on filename extension,
   * so saving a temporary file will not work, and the MimeType
   * will be "false".
   *
   * To get MimeType based on the magic number in a file,
   * file-type module might be a solution.
   *
   * The problem is that file-type only supports ES-Module currently.
   * https://github.com/sindresorhus/file-type/issues/525
   */
}

async function main() {
  const args = await parseArgs();

  if (args.command === "init") {
    await writeConfig(nit.nitconfigTemplate);
    await setWorkingAssetCid("");
    console.log('You can run "nit config -e" to set configuration now.');
    return
  } else if (fs.existsSync(configFilepath) === false) {
    console.log('Please run "nit init" to create config.');
    return
  } else {
    // config exists
  }

  const config = await loadConfig();
  const blockchain = await nit.loadBlockchain(config, contract.abi);

  await ipfs.initInfura(config.infura.projectId, config.infura.projectSecret);

  if (args.command === "ipfsadd") {
    const r = await ipfs.infuraIpfsAdd(args.params.fileapth);
    console.log(`Command ipfsadd result: ${JSON.stringify(r, null, 2)}`);
  } else if (args.command === "addv1") {
    const assetTreeFileContent = fs.readFileSync(args.params.filepath, "utf-8");
    const assetTree = JSON.parse(assetTreeFileContent);
    console.log(`Add assetTree: ${JSON.stringify(assetTree, null, 2)}\n`);

    // Create commit dir whose name is assetCid
    const commitDir = `${workingDir}/${assetTree.assetCid}`;
    if (fs.existsSync(commitDir) === false) {
      fs.mkdirSync(commitDir);
    } else {}

    // Check and set up license
    if (config.license == "custom") {
      assetTree.license = JSON.parse(config.licenseContent);
    } else {
      assetTree.license = license.Licenses[config.license];
    }

    // Create staged assetTree file
    console.log(`Current assetTree: ${JSON.stringify(assetTree, null, 2)}\n`);
    fs.writeFileSync(`${commitDir}/assetTree.json`, JSON.stringify(assetTree, null, 2));

    // Get assetTreeCid and encodingFormat
    const assetTreeInfo = await ipfs.infuraIpfsAdd(`${commitDir}/assetTree.json`);

    // Get assetTreeSha256
    const assetTreeSha256 = sha256(assetTreeFileContent);

    const commit = {
      "assetTreeCid": assetTreeInfo.assetCid,
      "assetTreeSha256": assetTreeSha256.toString(),
      "assetTreeSignature": await nit.signIntegrityHash(
                              assetTreeSha256.toString(), blockchain.signer),
      "author": config.author,
      "committer": config.committer,
      "action": action.Actions["action-initial-registration"],
      "actionResult": `https://${assetTreeInfo.assetCid}.ipfs.dweb.link`,
      "provider": config.provider,
      "abstract": "Initial registration.",
      "timestampCreated": Math.floor(Date.now() / 1000),
    }
    console.log(`Create temporary commit: ${JSON.stringify(commit, null, 2)}\n`);
    fs.writeFileSync(`${commitDir}/commit.json`, JSON.stringify(commit, null, 2));

    // Update current target assetCid
    await setWorkingAssetCid(assetTree.assetCid);
  } else if (args.command === "add") {
    console.log(`args.params: ${JSON.stringify(args.params)}`);

    // Create staged AssetTree
    const assetBytes = fs.readFileSync(args.params.filepath);
    //const assetBytes = await assetSourceToBytes(args.params.filepath);

    let assetCid;
    if ("mockup" in args.params === false) {
      assetCid = await ipfs.infuraIpfsAddBytes(assetBytes);
    } else {
      console.log(`Run add with mockup CID`);
      assetCid = "a".repeat(nit.cidv1Length);
    }
    let assetTree = await nit.pull(assetCid, blockchain);
    if (assetTree === null) {
      const assetMimetype = mime.lookup(args.params.filepath);
      const assetBirthtime = Math.floor(fs.statSync(args.params.filepath).birthtimeMs / 1000);
      //const assetMimetype = await getMimetypeFromBytes(assetBytes);
      //const assetBirthtime = Math.floor(Date.now() / 1000);

      assetTree = await nit.createAssetTreeInitialRegister(assetBytes,
                                                           assetMimetype,
                                                           assetBirthtime,
                                                           config.author,
                                                           config.license);
      console.log(`Add assetTree (initial registration): ${JSON.stringify(assetTree, null, 2)}\n`);
    } else {
      console.log(`Add assetTree (latest commit): ${JSON.stringify(assetTree, null, 2)}\n`);
    }

    let assetTreeUpdates: any = {};
    // Check and set up license
    if (config.license == "custom") {
      assetTreeUpdates.license = JSON.parse(config.licenseContent);
    } else {
      assetTreeUpdates.license = license.Licenses[config.license];
    }

    if ("message" in args.params) {
      assetTreeUpdates.abstract = args.params["message"];
    }
    if ("nft-record-cid" in args.params) {
      assetTreeUpdates.nftRecord = args.params["nft-record-cid"];
    }
    if ("integrity-cid" in args.params) {
      assetTreeUpdates.integrityCid= args.params["integrity-cid"];
    }
    console.log(`Current Asset Tree: ${JSON.stringify(assetTree, null, 2)}\n`);
    console.log(`Current Asset Tree Updates: ${JSON.stringify(assetTreeUpdates, null, 2)}\n`);

    const updatedAssetTree = await nit.updateAssetTree(assetTree, assetTreeUpdates);
    console.log(`Updated Asset Tree: ${JSON.stringify(updatedAssetTree, null, 2)}\n`);

    // Create staged Commit
    const commit = await nit.createCommitInitialRegister(blockchain.signer, config.author, config.committer, config.provider);
    console.log(`Current Commit: ${JSON.stringify(commit, null, 2)}\n`);

    // Stage
    await stage(updatedAssetTree.assetCid, updatedAssetTree, commit);
  } else if (args.command === "commit") {
    const assetCid = await getWorkingAssetCid();

    if (await getWorkingAssetCid() === "") {
      console.log("Need to add an Asset before commit");
      return;
    } else {
      // there is a working asset
    }

    let commitData = await getStagedCommit(assetCid);

    if ("message" in args.params) {
      commitData.abstract = args.params["message"];
    }
    if ("action" in args.params) {
      commitData.action = action.Actions[args.params["action"]];
    }
    if ("action-result" in args.params) {
      commitData.actionResult = args.params["action-result"];
    }

    // Update commit.timestampCreated
    commitData.timestampCreated = Math.floor(Date.now() / 1000);

    console.log(`Asset Cid (index): ${assetCid}`);
    console.log(`Commit: ${JSON.stringify(commitData, null, 2)}`);

    if ("dry-run" in args.params === false) {
      console.debug(`Committing...`);
      console.log([
        "Contract Information",
        `Signer wallet address: ${blockchain.signer.address}`,
        `Contract address: ${blockchain.contract.address}`,
      ]);

      let commitResult;
      if ("mockup" in args.params === false) {
        commitResult = await nit.commit(assetCid, JSON.stringify(commitData), blockchain);
      } else {
        commitResult = await nit.commit(nit.assetCidMock, JSON.stringify(commitData), blockchain);
      }

      console.log(`Commit Tx: ${commitResult.hash}`);
      console.log(`Commit Explorer: ${blockchain.explorerBaseUrl}/${commitResult.hash}`);

      // Reset stage
      await setWorkingAssetCid("");
    } else {
      console.log("This is dry run and Nit does not register this commit to blockchain.");
    }
  } else if (args.command === "status") {
    const workingAssetCid = await getWorkingAssetCid();
    if (workingAssetCid !== "") {
      const commitData = await getStagedCommit(workingAssetCid);
      const assetTree = await getStagedAssetTree(workingAssetCid);
      console.log(`[ Working Asset CID ]\n${workingAssetCid}\n`);
      console.log(`[ Staged Commit ]\n${JSON.stringify(commitData, null, 2)}\n`);
      console.log(`[ Staged AssetTree ]\n${JSON.stringify(assetTree, null, 2)}\n`);
    } else {
      console.log("No working Asset");
    }
  } else if (args.command === "verify") {
    const integrityHash = args.params["integrity-hash"];
    const signature = args.params.signature;
    const signerAddress = await nit.verifyIntegrityHash(integrityHash, signature);
    console.log(`Signer address: ${signerAddress}`);
  } else if (args.command === "log") {
    if ("asset-cid" in args.params) {
      await nit.log(args.params["asset-cid"], blockchain);
    } else {
      await help();
    }
  } else if (args.command === "config") {
    if ("edit" in args.params) {
      await launch(`${configFilepath}`);
    } else if ("list" in args.params) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      await help();
    }
  } else {
    await help();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });