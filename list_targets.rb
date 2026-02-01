require 'xcodeproj'
project = Xcodeproj::Project.open('ios/MyCommute.xcodeproj')
puts "Available Targets:"
project.targets.each { |t| puts " - '#{t.name}'" }
