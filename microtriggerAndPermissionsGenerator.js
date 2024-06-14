/**
 * README: This script is used to generate the metadata files for microtriggers and custom permissions.
 * It takes a csv file as input and generates the following metadata files:
 * 1. Microtrigger metadata files
 * 2. Custom Permission metadata files
 * 3. Permission Set metadata file
 * 4. Package.xml file
 * 
 * To run this program, first run the annonymous apex script (in this current directory, named createMicrotriggersCSV.apex) to 
 * create the microtriggers in csv format, then copy and paste the debug into microtriggers.csv. Easiest way to copy the debug is download
 * the log.
 * 
 * If first time running the program, navigate to this directory and run `npm install` to install the required packages.
 * Run the program using `node microtriggerAndPermissionsGenerator.js -f microtriggers.csv`
 * 
 * This will generate all the metadata files in the metadata directory.
 * Move the metadata files to the appropriate directory in the Salesforce project. (Replace existing files)
 * Move the package.xml file to the approriate directory in the Salesforce project. (Replace existing files)
 * Deploy the package.xml file, then retrieve using same package.xml file to get the metadata files.
 * Note: package.xml will not contain permission set in there which is why the below step is needed.
 * You can discard all the metadata files that we created in this directory now.
 * 
 * For the permission set, you will need to move it to the appropriate directory in the Salesforce project.
 * Then, compare the diff and add all the previous values back in the metadata.
 * 
 * After doing all this, you can push all the changed files into a branch and create a PR to deploy the changes in all orgs
 */


const { program } = require("commander");
const csv = require("csvtojson");
const convert = require("xml-js");
const fs = require("fs");
const { create } = require("domain");

main();

async function main() {
  program
    .version("0.0.1")
    .requiredOption("-f, --file <file>", "Name of csv file.")
    .parse(process.argv);

  const args = program.opts();
  const path = __dirname + "/" + args.file;
  const customMetadataRows = await csv().fromFile(path);

  let microtriggerMembers = createMicrotriggerXML(customMetadataRows);
  let customPermissionMembers = createCustomPermissionXML(customMetadataRows);

  createPermissionSetXML(customMetadataRows);

  createPackageXML(microtriggerMembers, customPermissionMembers);
}

/**
 *
 * @param {string[]} customMetadataRows - The custom metadata rows from the csv file
 * @returns {string[]} - The names of the microtrigger members in format Microtrigger.<DeveloperName>
 */
function createMicrotriggerXML(customMetadataRows) {
  let microtriggerMembers = [];

  for (const customMetadataRow of customMetadataRows) {
    const values = [];

    for (const row of Object.keys(customMetadataRow)) {
      if (row === "DeveloperName" || row === "Label") {
        continue;
      } else if (row === "Custom_Permissions__c") {
        customMetadataRow[row] = createCustomPermissionName(
          customMetadataRow.DeveloperName
        );
      } else if (row === "Run_Or_Bypass__c") {
        customMetadataRow[row] = "Bypass";
      }

      values.push({
        field: row,
        'value xsi:type="xsd:string"': customMetadataRow[row],
      });
    }

    const metadataXML = {
      _declaration: {
        _attributes: {
          version: "1.0",
          encoding: "UTF-8",
        },
      },
      CustomMetadata: {
        _attributes: {
          xmlns: "http://soap.sforce.com/2006/04/metadata",
          "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
          "xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
        },
        label: customMetadataRow.Label,
        protected: false,
        values,
      },
    };

    const fileName =
      "Microtrigger." + customMetadataRow.DeveloperName + ".md-meta.xml";
    microtriggerMembers.push('Microtrigger.' + customMetadataRow.DeveloperName);

    const options = { compact: true, ignoreComment: true, spaces: 4 };

    let xml = convert.js2xml(metadataXML, options) + "\n";
    xml = xml.replace('/value xsi:type="xsd:string"', "/value");
    xml = xml.replace('/value xsi:type="xsd:string"', "/value");

    writeXMLFile("metadata", fileName, xml);
  }

  return microtriggerMembers;
}

/**
 * 
 * @param {string[]} customMetadataRows - The custom metadata rows from the csv file
 * @returns {string[]} - The names of the custom permission members in format A_AX_BP_<DeveloperName>
 */
function createCustomPermissionXML(customMetadataRows) {
  let customPermissionMembers = [];

  for (const row of customMetadataRows) {
    let permissionName = createCustomPermissionName(row.DeveloperName);

    const customPermissionXML = {
      _declaration: {
        _attributes: {
          version: "1.0",
          encoding: "UTF-8",
        },
      },
      CustomPermission: {
        _attributes: {
          xmlns: "http://soap.sforce.com/2006/04/metadata",
        },
        description:
          "#156529 Adding custom permission to bypass microtrigger " +
          row.Label,
        isLicensed: false,
        label: permissionName,
      },
    };

    const fileName = permissionName + ".customPermission-meta.xml";
    customPermissionMembers.push(permissionName);

    const options = { compact: true, ignoreComment: true, spaces: 4 };
    const xml = convert.js2xml(customPermissionXML, options) + "\n";
    writeXMLFile("metadata", fileName, xml);
  }

  return customPermissionMembers;
}

/**
 * 
 * @param {string[]} customMetadataRows - The custom metadata rows from the csv file
 */
function createPermissionSetXML(customMetadataRows) {
  let customPermissions = [];
  for (const row of customMetadataRows) {
    customPermissions.push({
      enabled: true,
      name: createCustomPermissionName(row.DeveloperName),
    });
  }

  const permissionSetXML = {
    _declaration: {
      _attributes: {
        version: "1.0",
        encoding: "UTF-8",
      },
    },
    PermissionSet: {
      _attributes: {
        xmlns: "http://soap.sforce.com/2006/04/metadata",
      },
      customPermissions,
      label: "MicroTriggers - Integration User - E",
    },
  };

  const fileName = "MicroTriggers_Integration_User_E.permissionset-meta.xml";
  const options = { compact: true, ignoreComment: true, spaces: 4 };
  const xml = convert.js2xml(permissionSetXML, options) + "\n";
  writeXMLFile("metadata", fileName, xml);
}

/**
 * 
 * @param {string[]} microtriggerMembers - The names of the microtrigger members in format Microtrigger.<DeveloperName>
 * @param {string[]} customPermissionMembers - The names of the custom permission members in format A_AX_BP_<DeveloperName>
 */
function createPackageXML(microtriggerMembers, customPermissionMembers) {
  const mtMembers = [];
  const cpMembers = [];

  for (const microtriggerMember of microtriggerMembers) {
    mtMembers.push(microtriggerMember);
  }

  for (const customPermissionMember of customPermissionMembers) {
    cpMembers.push(customPermissionMember);
  }

  let microtriggerPackageXML = {
    _declaration: {
      _attributes: {
        version: "1.0",
        encoding: "UTF-8",
        standalone: "yes",
      },
    },
    Package: {
      _attributes: {
        xmlns: "http://soap.sforce.com/2006/04/metadata",
      },
      types: [
        {
          members: mtMembers,
          name: "CustomMetadata",
        },
      ],
    },
  };

  let customPermissionPackageXML = {
    '': {
      types: [
        {
          members: cpMembers,
          name: "CustomPermission",
        },
      ],
      version: "58.0",
    },
  };

  const options = { compact: true, ignoreComment: true, spaces: 4 };
  mtXML = convert.js2xml(microtriggerPackageXML, options);
  cpXML = convert.js2xml(customPermissionPackageXML, options);

  mtXML = mtXML.replace("</types>", "</types>" + "\n" + cpXML);

  writeXMLFile("metadata", "package.xml", mtXML);
}

/**
 * 
 * @param {string} directory - name of directory you want xml files to go under
 * @param {string} fileName - name of xml file you are creating
 * @param {object} xml - the xml object you are writing to the file
 */
function writeXMLFile(directory, fileName, xml) {
  const dirPath = __dirname + (directory ? "/" + directory : "");

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }

  const path = dirPath + "/" + fileName;
  fs.writeFileSync(path, xml);
}

function createCustomPermissionName(fileName) {
  return "A_AX_BP_" + fileName;
}
