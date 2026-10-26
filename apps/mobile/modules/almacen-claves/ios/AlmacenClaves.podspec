Pod::Spec.new do |s|
  s.name           = 'AlmacenClaves'
  s.version        = '0.0.0'
  s.summary        = 'Claves RSA en el Keychain'
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
