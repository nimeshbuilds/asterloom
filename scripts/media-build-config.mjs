export const WINDOWS_CPU_BACKENDS=['ggml-cpu-x64','ggml-cpu-haswell'];
export const WINDOWS_SPEECH_DLLS=['whisper.dll','ggml.dll','ggml-base.dll',...WINDOWS_CPU_BACKENDS.map(name=>name+'.dll')];
export function whisperLinkConfiguration(platform){
 return platform==='win32'?{flags:['-DBUILD_SHARED_LIBS=ON','-DGGML_BACKEND_DL=ON','-DGGML_CPU_ALL_VARIANTS=ON','-DASTERLOOM_CPU_VARIANTS=x64;haswell'],targets:['whisper-cli',...WINDOWS_CPU_BACKENDS],dlls:WINDOWS_SPEECH_DLLS}:{flags:['-DBUILD_SHARED_LIBS=OFF','-DGGML_BACKEND_DL=OFF','-DGGML_CPU_ALL_VARIANTS=OFF'],targets:['whisper-cli'],dlls:[]};
}

const original='    // FIXME: this does not check for OS support\n\n    int score = 1;\n    cpuid_x86 is;';
const replacement=`    // Asterloom: check Windows OS-managed XMM/YMM state before scoring AVX.
    int score = 1;
    cpuid_x86 is;
#if defined(_MSC_VER) && (defined(GGML_AVX) || defined(GGML_AVX2))
    if (!is.XSAVE() || !is.OSXSAVE() || (_xgetbv(0) & 0x6) != 0x6) {
        return 0;
    }
#endif`;
export function applyWindowsAvxOsGuard(source){
 if(source.includes(replacement))return source;
 if(source.split(original).length!==2)throw new Error('Pinned whisper.cpp CPU scoring source changed; review the AVX OS-state guard.');
 return source.replace(original,replacement);
}
const cmakeOriginal='function(ggml_add_cpu_backend_variant tag_name)';
const cmakeReplacement=`function(ggml_add_cpu_backend_variant tag_name)
    # Asterloom: build only the explicitly shipped upstream CPU variants.
    if (DEFINED ASTERLOOM_CPU_VARIANTS AND NOT tag_name IN_LIST ASTERLOOM_CPU_VARIANTS)
        return()
    endif()`;
export function applyWindowsCpuVariantAllowlist(source){
 if(source.includes(cmakeReplacement))return source;
 if(source.split(cmakeOriginal).length!==2)throw new Error('Pinned whisper.cpp CPU CMake source changed; review the variant allowlist.');
 return source.replace(cmakeOriginal,cmakeReplacement);
}
export const WINDOWS_AVX_GUARD_PATCH=`--- a/ggml/src/ggml-cpu/arch/x86/cpu-feats.cpp
+++ b/ggml/src/ggml-cpu/arch/x86/cpu-feats.cpp
@@ -264,4 +264,8 @@
${original.split('\n').map(line=>'-'+line).join('\n')}
${replacement.split('\n').map(line=>'+'+line).join('\n')}
--- a/ggml/src/CMakeLists.txt
+++ b/ggml/src/CMakeLists.txt
@@ -441,1 +441,5 @@
-${cmakeOriginal}
${cmakeReplacement.split('\n').map(line=>'+'+line).join('\n')}
`;
