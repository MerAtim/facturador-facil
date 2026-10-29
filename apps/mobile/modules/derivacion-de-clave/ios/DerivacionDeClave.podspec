Pod::Spec.new do |s|
  s.name           = 'DerivacionDeClave'
  s.version        = '0.0.0'
  s.summary        = 'Deriva la clave del respaldo'
  s.license        = 'MIT'
  s.author         = 'Facturador Fácil'
  s.homepage       = 'https://github.com/MerAtim/facturador-facil'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
