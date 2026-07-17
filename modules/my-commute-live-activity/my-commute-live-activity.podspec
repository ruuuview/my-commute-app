require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'my-commute-live-activity'
  s.version      = package['version']
  s.summary      = package['description']
  s.author       = 'My Commute'
  s.homepage     = 'https://github.com/my-commute'
  s.license      = 'MIT'
  s.platforms    = { :ios => '16.2' }
  s.source       = { :git => 'https://github.com/my-commute/my-commute.git', :tag => "v#{s.version}" }
  s.source_files = 'ios/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
end
