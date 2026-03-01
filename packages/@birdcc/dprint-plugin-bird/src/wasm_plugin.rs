use dprint_core::configuration::ConfigKeyMap;
use dprint_core::configuration::GlobalConfiguration;
use dprint_core::generate_plugin_code;
use dprint_core::plugins::CheckConfigUpdatesMessage;
use dprint_core::plugins::ConfigChange;
use dprint_core::plugins::FileMatchingInfo;
use dprint_core::plugins::FormatResult;
use dprint_core::plugins::PluginInfo;
use dprint_core::plugins::PluginResolveConfigurationResult;
use dprint_core::plugins::SyncFormatRequest;
use dprint_core::plugins::SyncHostFormatRequest;
use dprint_core::plugins::SyncPluginHandler;

use crate::configuration::resolve_config;
use crate::configuration::Configuration;

struct BirdccPluginHandler;

impl SyncPluginHandler<Configuration> for BirdccPluginHandler {
    fn resolve_config(
        &mut self,
        config: ConfigKeyMap,
        global_config: &GlobalConfiguration,
    ) -> PluginResolveConfigurationResult<Configuration> {
        let config = resolve_config(config, global_config);
        PluginResolveConfigurationResult {
            config: config.config,
            diagnostics: config.diagnostics,
            file_matching: FileMatchingInfo {
                file_extensions: vec!["conf".to_string(), "bird".to_string()],
                file_names: vec![],
            },
        }
    }

    fn check_config_updates(
        &self,
        _message: CheckConfigUpdatesMessage,
    ) -> Result<Vec<ConfigChange>, anyhow::Error> {
        Ok(Vec::new())
    }

    fn plugin_info(&mut self) -> PluginInfo {
        PluginInfo {
            name: env!("CARGO_PKG_NAME").to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            config_key: "birdcc".to_string(),
            help_url: "https://github.com/bird-chinese-community/BIRD-LSP".to_string(),
            config_schema_url:
                "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/dprint-plugin-bird.schema.json"
                    .to_string(),
            update_url: None,
        }
    }

    fn license_text(&mut self) -> String {
        "MIT".to_string()
    }

    fn format(
        &mut self,
        request: SyncFormatRequest<Configuration>,
        _format_with_host: impl FnMut(SyncHostFormatRequest) -> FormatResult,
    ) -> FormatResult {
        let file_text = String::from_utf8(request.file_bytes)?;
        crate::format_text(request.file_path, &file_text, &request.config)
            .map(|maybe_text| maybe_text.map(|text| text.into_bytes()))
    }
}

generate_plugin_code!(BirdccPluginHandler, BirdccPluginHandler);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_raw_github_schema_url() {
        let mut handler = BirdccPluginHandler;
        let plugin_info = handler.plugin_info();
        assert_eq!(
            plugin_info.config_schema_url,
            "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/dprint-plugin-bird.schema.json"
        );
    }
}
