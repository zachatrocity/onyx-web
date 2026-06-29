#[cfg(desktop)]
mod update;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	let mut t = tauri::Builder::default();

	#[cfg(desktop)]
	{
		use tauri::Manager;
		t = t.plugin(tauri_plugin_updater::Builder::new().build());

		// Start background update checker (desktop only)
		t = t.setup(|app| {
			let handle = app.handle().clone();
			tauri::async_runtime::spawn(async move {
				update::run(handle).await.expect("update loop failed");
			});
			Ok(())
		});

		// Must be before deep link
		t = t.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
			// Focus the main window
			let _ = app.get_webview_window("main").expect("no main window").set_focus();
		}));
	};

	t = t.plugin(tauri_plugin_deep_link::init());

	// On Linux and Windows, register deep links at run time when in development mode.
	// Otherwise the app would need to be installed to register deep links.
	#[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
	{
		t = t.setup(|app| {
			use tauri_plugin_deep_link::DeepLinkExt;
			app.deep_link().register_all()?;
			Ok(())
		});
	}
	t = t.plugin(tauri_plugin_opener::init());
	t = t.plugin(tauri_plugin_process::init());

	t.run(tauri::generate_context!())
		.expect("error while running tauri application");
}
