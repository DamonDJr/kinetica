#!/usr/bin/env python3
"""Generate Kinetica.xcodeproj from the source tree.

Xcode 13 has no command-line way to add files to a target, and hand-editing a
pbxproj is a good way to lose an afternoon. This walks ios/Kinetica, mirrors the
directory structure as Xcode groups, and assigns every file to the right build
phase. Object ids are md5-derived from each file's path, so re-running produces
a byte-identical project unless the tree actually changed — which keeps the
diff readable when files are added.

    python3 ios/tools/generate_project.py

Run it after adding or removing a Swift file, then reopen the project.
"""

import hashlib
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP_DIR = os.path.join(ROOT, "Kinetica")
PROJECT_DIR = os.path.join(ROOT, "Kinetica.xcodeproj")

PROJECT_NAME = "Kinetica"
BUNDLE_ID = "com.damonj.kinetica"
DEPLOYMENT_TARGET = "15.0"
SWIFT_VERSION = "5.5"

# Files carried into the bundle rather than compiled.
# .txt is here for the font licence: the OFL asks to travel with the font, and
# the font travels inside the .ipa.
RESOURCE_EXTENSIONS = {".xcassets", ".ttf", ".otf", ".png", ".json", ".txt"}
SOURCE_EXTENSIONS = {".swift"}
# Referenced by INFOPLIST_FILE, so it must not also sit in a build phase.
EXCLUDED = {"Info.plist"}
# Directories treated as a single file reference rather than descended into.
OPAQUE_DIRS = {".xcassets"}


def uid(*parts):
    """Deterministic 24-hex-character object id."""
    digest = hashlib.md5("::".join(parts).encode("utf-8")).hexdigest()
    return digest[:24].upper()


def file_type(name):
    if name.endswith(".swift"):
        return "sourcecode.swift"
    if name.endswith(".xcassets"):
        return "folder.assetcatalog"
    if name.endswith(".plist"):
        return "text.plist.xml"
    if name.endswith(".ttf") or name.endswith(".otf"):
        return "file"
    if name.endswith(".png"):
        return "image.png"
    if name.endswith(".json"):
        return "text.json"
    return "text"


class Node:
    def __init__(self, name, path, is_dir):
        self.name = name
        self.path = path  # relative to APP_DIR
        self.is_dir = is_dir
        self.children = []

    @property
    def ref_id(self):
        return uid("ref", self.path)

    @property
    def build_id(self):
        return uid("build", self.path)


def scan(directory, relative=""):
    """Build the group tree, sorted so output is stable across filesystems."""
    node = Node(os.path.basename(directory) or PROJECT_NAME, relative, True)
    for entry in sorted(os.listdir(directory)):
        if entry.startswith("."):
            continue
        full = os.path.join(directory, entry)
        rel = os.path.join(relative, entry) if relative else entry
        extension = os.path.splitext(entry)[1]
        if os.path.isdir(full) and extension not in OPAQUE_DIRS:
            child = scan(full, rel)
            if child.children:
                node.children.append(child)
        else:
            node.children.append(Node(entry, rel, False))
    return node


def collect(node, sources, resources):
    for child in node.children:
        if child.is_dir:
            collect(child, sources, resources)
            continue
        if child.name in EXCLUDED:
            continue
        extension = os.path.splitext(child.name)[1]
        if extension in SOURCE_EXTENSIONS:
            sources.append(child)
        elif extension in RESOURCE_EXTENSIONS:
            # Files *inside* an .xcassets bundle are covered by the catalog
            # reference itself and must not be listed individually — but the
            # catalog itself very much does need to be here.
            if ".xcassets" in os.path.dirname(child.path):
                continue
            resources.append(child)


def emit_file_references(node, lines):
    for child in node.children:
        if child.is_dir:
            emit_file_references(child, lines)
        else:
            lines.append(
                '\t\t{id} /* {name} */ = {{isa = PBXFileReference; '
                'lastKnownFileType = {type}; path = "{name}"; sourceTree = "<group>"; }};'.format(
                    id=child.ref_id, name=child.name, type=file_type(child.name)
                )
            )


def emit_groups(node, lines, group_id, group_name, is_root=False):
    children = []
    for child in node.children:
        if child.is_dir:
            children.append('\t\t\t\t{id} /* {name} */,'.format(id=uid("group", child.path), name=child.name))
        else:
            children.append('\t\t\t\t{id} /* {name} */,'.format(id=child.ref_id, name=child.name))
    lines.append('\t\t{id} /* {name} */ = {{'.format(id=group_id, name=group_name))
    lines.append("\t\t\tisa = PBXGroup;")
    lines.append("\t\t\tchildren = (")
    lines.extend(children)
    lines.append("\t\t\t);")
    if not is_root:
        lines.append('\t\t\tpath = "{name}";'.format(name=group_name))
    lines.append('\t\t\tsourceTree = "<group>";')
    lines.append("\t\t};")
    for child in node.children:
        if child.is_dir:
            emit_groups(child, lines, uid("group", child.path), child.name)


def build():
    tree = scan(APP_DIR)
    sources, resources = [], []
    collect(tree, sources, resources)

    project_id = uid("project")
    target_id = uid("target")
    product_ref = uid("product")
    main_group = uid("maingroup")
    products_group = uid("productsgroup")
    app_group = uid("group", "")
    sources_phase = uid("phase", "sources")
    resources_phase = uid("phase", "resources")
    frameworks_phase = uid("phase", "frameworks")
    project_config_list = uid("configlist", "project")
    target_config_list = uid("configlist", "target")
    debug_project = uid("config", "project.debug")
    release_project = uid("config", "project.release")
    debug_target = uid("config", "target.debug")
    release_target = uid("config", "target.release")

    lines = []
    add = lines.append

    add("// !$*UTF8*$!")
    add("{")
    add("\tarchiveVersion = 1;")
    add("\tclasses = {")
    add("\t};")
    add("\tobjectVersion = 55;")
    add("\tobjects = {")

    # PBXBuildFile
    add("")
    add("/* Begin PBXBuildFile section */")
    for node in sources + resources:
        add(
            '\t\t{build} /* {name} in {phase} */ = {{isa = PBXBuildFile; '
            'fileRef = {ref} /* {name} */; }};'.format(
                build=node.build_id,
                ref=node.ref_id,
                name=node.name,
                phase="Sources" if node in sources else "Resources",
            )
        )
    add("/* End PBXBuildFile section */")

    # PBXFileReference
    add("")
    add("/* Begin PBXFileReference section */")
    add(
        '\t\t{id} /* {name}.app */ = {{isa = PBXFileReference; explicitFileType = '
        '"wrapper.application"; includeInIndex = 0; path = "{name}.app"; '
        'sourceTree = BUILT_PRODUCTS_DIR; }};'.format(id=product_ref, name=PROJECT_NAME)
    )
    emit_file_references(tree, lines)
    add("/* End PBXFileReference section */")

    # PBXFrameworksBuildPhase
    add("")
    add("/* Begin PBXFrameworksBuildPhase section */")
    add('\t\t{id} /* Frameworks */ = {{'.format(id=frameworks_phase))
    add("\t\t\tisa = PBXFrameworksBuildPhase;")
    add("\t\t\tbuildActionMask = 2147483647;")
    add("\t\t\tfiles = (")
    add("\t\t\t);")
    add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    add("\t\t};")
    add("/* End PBXFrameworksBuildPhase section */")

    # PBXGroup
    add("")
    add("/* Begin PBXGroup section */")
    add('\t\t{id} = {{'.format(id=main_group))
    add("\t\t\tisa = PBXGroup;")
    add("\t\t\tchildren = (")
    add('\t\t\t\t{id} /* {name} */,'.format(id=app_group, name=PROJECT_NAME))
    add('\t\t\t\t{id} /* Products */,'.format(id=products_group))
    add("\t\t\t);")
    add('\t\t\tsourceTree = "<group>";')
    add("\t\t};")
    add('\t\t{id} /* Products */ = {{'.format(id=products_group))
    add("\t\t\tisa = PBXGroup;")
    add("\t\t\tchildren = (")
    add('\t\t\t\t{id} /* {name}.app */,'.format(id=product_ref, name=PROJECT_NAME))
    add("\t\t\t);")
    add("\t\t\tname = Products;")
    add('\t\t\tsourceTree = "<group>";')
    add("\t\t};")
    emit_groups(tree, lines, app_group, PROJECT_NAME)
    add("/* End PBXGroup section */")

    # PBXNativeTarget
    add("")
    add("/* Begin PBXNativeTarget section */")
    add('\t\t{id} /* {name} */ = {{'.format(id=target_id, name=PROJECT_NAME))
    add("\t\t\tisa = PBXNativeTarget;")
    add('\t\t\tbuildConfigurationList = {id} /* Build configuration list for PBXNativeTarget "{name}" */;'.format(
        id=target_config_list, name=PROJECT_NAME))
    add("\t\t\tbuildPhases = (")
    add('\t\t\t\t{id} /* Sources */,'.format(id=sources_phase))
    add('\t\t\t\t{id} /* Frameworks */,'.format(id=frameworks_phase))
    add('\t\t\t\t{id} /* Resources */,'.format(id=resources_phase))
    add("\t\t\t);")
    add("\t\t\tbuildRules = (")
    add("\t\t\t);")
    add("\t\t\tdependencies = (")
    add("\t\t\t);")
    add('\t\t\tname = "{name}";'.format(name=PROJECT_NAME))
    add('\t\t\tproductName = "{name}";'.format(name=PROJECT_NAME))
    add('\t\t\tproductReference = {id} /* {name}.app */;'.format(id=product_ref, name=PROJECT_NAME))
    add('\t\t\tproductType = "com.apple.product-type.application";')
    add("\t\t};")
    add("/* End PBXNativeTarget section */")

    # PBXProject
    add("")
    add("/* Begin PBXProject section */")
    add('\t\t{id} /* Project object */ = {{'.format(id=project_id))
    add("\t\t\tisa = PBXProject;")
    add("\t\t\tattributes = {")
    add("\t\t\t\tBuildIndependentTargetsInParallel = 1;")
    add("\t\t\t\tLastSwiftUpdateCheck = 1320;")
    add("\t\t\t\tLastUpgradeCheck = 1320;")
    add("\t\t\t\tTargetAttributes = {")
    add('\t\t\t\t\t{id} = {{'.format(id=target_id))
    add("\t\t\t\t\t\tCreatedOnToolsVersion = 13.2.1;")
    add("\t\t\t\t\t};")
    add("\t\t\t\t};")
    add("\t\t\t};")
    add('\t\t\tbuildConfigurationList = {id} /* Build configuration list for PBXProject "{name}" */;'.format(
        id=project_config_list, name=PROJECT_NAME))
    add("\t\t\tcompatibilityVersion = \"Xcode 13.0\";")
    add("\t\t\tdevelopmentRegion = en;")
    add("\t\t\thasScannedForEncodings = 0;")
    add("\t\t\tknownRegions = (")
    add("\t\t\t\ten,")
    add("\t\t\t\tBase,")
    add("\t\t\t);")
    add('\t\t\tmainGroup = {id};'.format(id=main_group))
    add('\t\t\tproductRefGroup = {id} /* Products */;'.format(id=products_group))
    add('\t\t\tprojectDirPath = "";')
    add('\t\t\tprojectRoot = "";')
    add("\t\t\ttargets = (")
    add('\t\t\t\t{id} /* {name} */,'.format(id=target_id, name=PROJECT_NAME))
    add("\t\t\t);")
    add("\t\t};")
    add("/* End PBXProject section */")

    # PBXResourcesBuildPhase
    add("")
    add("/* Begin PBXResourcesBuildPhase section */")
    add('\t\t{id} /* Resources */ = {{'.format(id=resources_phase))
    add("\t\t\tisa = PBXResourcesBuildPhase;")
    add("\t\t\tbuildActionMask = 2147483647;")
    add("\t\t\tfiles = (")
    for node in resources:
        add('\t\t\t\t{id} /* {name} in Resources */,'.format(id=node.build_id, name=node.name))
    add("\t\t\t);")
    add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    add("\t\t};")
    add("/* End PBXResourcesBuildPhase section */")

    # PBXSourcesBuildPhase
    add("")
    add("/* Begin PBXSourcesBuildPhase section */")
    add('\t\t{id} /* Sources */ = {{'.format(id=sources_phase))
    add("\t\t\tisa = PBXSourcesBuildPhase;")
    add("\t\t\tbuildActionMask = 2147483647;")
    add("\t\t\tfiles = (")
    for node in sources:
        add('\t\t\t\t{id} /* {name} in Sources */,'.format(id=node.build_id, name=node.name))
    add("\t\t\t);")
    add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    add("\t\t};")
    add("/* End PBXSourcesBuildPhase section */")

    # XCBuildConfiguration
    common_project = [
        "ALWAYS_SEARCH_USER_PATHS = NO;",
        "CLANG_ENABLE_MODULES = YES;",
        "CLANG_ENABLE_OBJC_ARC = YES;",
        "COPY_PHASE_STRIP = NO;",
        "ENABLE_STRICT_OBJC_MSGSEND = YES;",
        "GCC_C_LANGUAGE_STANDARD = gnu11;",
        'IPHONEOS_DEPLOYMENT_TARGET = {0};'.format(DEPLOYMENT_TARGET),
        "SDKROOT = iphoneos;",
        "SWIFT_EMIT_LOC_STRINGS = YES;",
    ]
    common_target = [
        "ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;",
        "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;",
        "CODE_SIGN_STYLE = Automatic;",
        "CURRENT_PROJECT_VERSION = 1;",
        'DEVELOPMENT_TEAM = "";',
        "ENABLE_PREVIEWS = YES;",
        "GENERATE_INFOPLIST_FILE = NO;",
        'INFOPLIST_FILE = "{0}/Info.plist";'.format(PROJECT_NAME),
        "LD_RUNPATH_SEARCH_PATHS = (",
        '\t"$(inherited)",',
        '\t"@executable_path/Frameworks",',
        ");",
        "MARKETING_VERSION = 1.0;",
        'PRODUCT_BUNDLE_IDENTIFIER = "{0}";'.format(BUNDLE_ID),
        'PRODUCT_NAME = "$(TARGET_NAME)";',
        "SWIFT_EMIT_LOC_STRINGS = YES;",
        'SWIFT_VERSION = {0};'.format(SWIFT_VERSION),
        "TARGETED_DEVICE_FAMILY = 1;",
    ]

    def emit_config(config_id, name, settings, extra):
        add('\t\t{id} /* {name} */ = {{'.format(id=config_id, name=name))
        add("\t\t\tisa = XCBuildConfiguration;")
        add("\t\t\tbuildSettings = {")
        for setting in settings + extra:
            add("\t\t\t\t" + setting)
        add("\t\t\t};")
        add('\t\t\tname = {name};'.format(name=name))
        add("\t\t};")

    add("")
    add("/* Begin XCBuildConfiguration section */")
    emit_config(debug_project, "Debug", common_project, [
        "DEBUG_INFORMATION_FORMAT = dwarf;",
        "ENABLE_TESTABILITY = YES;",
        "GCC_OPTIMIZATION_LEVEL = 0;",
        "GCC_PREPROCESSOR_DEFINITIONS = (",
        '\t"DEBUG=1",',
        '\t"$(inherited)",',
        ");",
        "MTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;",
        "ONLY_ACTIVE_ARCH = YES;",
        'SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;',
        'SWIFT_OPTIMIZATION_LEVEL = "-Onone";',
    ])
    emit_config(release_project, "Release", common_project, [
        'DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";',
        "ENABLE_NS_ASSERTIONS = NO;",
        "MTL_ENABLE_DEBUG_INFO = NO;",
        "SWIFT_COMPILATION_MODE = wholemodule;",
        'SWIFT_OPTIMIZATION_LEVEL = "-O";',
        "VALIDATE_PRODUCT = YES;",
    ])
    emit_config(debug_target, "Debug", common_target, [])
    emit_config(release_target, "Release", common_target, [])
    add("/* End XCBuildConfiguration section */")

    # XCConfigurationList
    add("")
    add("/* Begin XCConfigurationList section */")
    for list_id, label, debug_id, release_id in [
        (project_config_list, 'PBXProject "{0}"'.format(PROJECT_NAME), debug_project, release_project),
        (target_config_list, 'PBXNativeTarget "{0}"'.format(PROJECT_NAME), debug_target, release_target),
    ]:
        add('\t\t{id} /* Build configuration list for {label} */ = {{'.format(id=list_id, label=label))
        add("\t\t\tisa = XCConfigurationList;")
        add("\t\t\tbuildConfigurations = (")
        add('\t\t\t\t{id} /* Debug */,'.format(id=debug_id))
        add('\t\t\t\t{id} /* Release */,'.format(id=release_id))
        add("\t\t\t);")
        add("\t\t\tdefaultConfigurationIsVisible = 0;")
        add("\t\t\tdefaultConfigurationName = Release;")
        add("\t\t};")
    add("/* End XCConfigurationList section */")

    add("\t};")
    add('\trootObject = {id} /* Project object */;'.format(id=project_id))
    add("}")

    return "\n".join(lines) + "\n", sources, resources


SCHEME = """<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "1320" version = "1.3">
   <BuildAction parallelizeBuildables = "YES" buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting = "YES" buildForRunning = "YES" buildForProfiling = "YES" buildForArchiving = "YES" buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "{target}"
               BuildableName = "{name}.app"
               BlueprintName = "{name}"
               ReferencedContainer = "container:{name}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
      </Testables>
   </TestAction>
   <LaunchAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle = "0" useCustomWorkingDirectory = "NO" ignoresPersistentStateOnLaunch = "NO" debugDocumentVersioning = "YES" debugServiceExtension = "internal" allowLocationSimulation = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{target}"
            BuildableName = "{name}.app"
            BlueprintName = "{name}"
            ReferencedContainer = "container:{name}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction buildConfiguration = "Release" shouldUseLaunchSchemeArgsEnv = "YES" savedToolIdentifier = "" useCustomWorkingDirectory = "NO" debugDocumentVersioning = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{target}"
            BuildableName = "{name}.app"
            BlueprintName = "{name}"
            ReferencedContainer = "container:{name}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction buildConfiguration = "Release" revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
"""


def main():
    content, sources, resources = build()

    os.makedirs(PROJECT_DIR, exist_ok=True)
    with open(os.path.join(PROJECT_DIR, "project.pbxproj"), "w") as handle:
        handle.write(content)

    schemes_dir = os.path.join(PROJECT_DIR, "xcshareddata", "xcschemes")
    os.makedirs(schemes_dir, exist_ok=True)
    with open(os.path.join(schemes_dir, PROJECT_NAME + ".xcscheme"), "w") as handle:
        handle.write(SCHEME.format(target=uid("target"), name=PROJECT_NAME))

    workspace_dir = os.path.join(PROJECT_DIR, "project.xcworkspace")
    os.makedirs(workspace_dir, exist_ok=True)
    with open(os.path.join(workspace_dir, "contents.xcworkspacedata"), "w") as handle:
        handle.write(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<Workspace version = "1.0">\n'
            '   <FileRef location = "self:">\n'
            '   </FileRef>\n'
            '</Workspace>\n'
        )

    print("{0} sources, {1} resources".format(len(sources), len(resources)))
    for node in sources:
        print("  swift  ", node.path)
    for node in resources:
        print("  bundle ", node.path)


if __name__ == "__main__":
    main()
