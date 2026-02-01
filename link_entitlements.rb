require 'xcodeproj'

project_path = 'ios/MyCommute.xcodeproj'
project = Xcodeproj::Project.open(project_path)

target = project.targets.find { |t| t.name == 'CommuteWidgetExtension' }

if target
  target.build_configuration_list.build_configurations.each do |config|
    # FIX: Use 'CommuteWidget/...' directly. No 'ios/' needed.
    config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'CommuteWidget/CommuteWidget.entitlements'
  end
  project.save
  puts "Success: Fixed Entitlements Path."
else
  puts "Error: Target 'CommuteWidgetExtension' not found."
end
