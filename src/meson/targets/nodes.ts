import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Target, Targets } from "../types";
import { extensionRelative, randomString, getTargetName } from "../../utils";
import { BaseNode } from "../basenode";
