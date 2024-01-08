# frozen_string_literal: true

# rubocop:disable Metrics/BlockLength, Layout/LineLength
require 'English'
require 'json'

PROJECT_ROOT = File.expand_path(File.dirname('../..'))

class AWS
  PROFILE = ENV.fetch('AWS_PROFILE', nil)
  CMD = "aws #{"--profile #{PROFILE}" if PROFILE} --region ap-northeast-1 --output json".freeze
end

class Docker
  COMMIT_HASH = `git rev-parse HEAD -- . | head -1`.chomp
  BASE_URL = '640869257465.dkr.ecr.ap-northeast-1.amazonaws.com'
  REPO = {
    member: 'archers90-member',
    archer: 'archers90-archer',
  }.freeze

  class << self
    def image_tagged_name(app) = "#{REPO[app]}:#{COMMIT_HASH}"
    def image_url(app) = "#{BASE_URL}/#{image_tagged_name(app)}"
    def tags(app) = [image_url(app), "#{BASE_URL}/#{REPO[app]}:latest"]
  end
end

class ECSpresso
  CMD_BASE = "SENTRY_RELEASE=#{Docker::COMMIT_HASH} AWS_SDK_LOAD_CONFIG=true AWS_PROFILE=#{AWS::PROFILE} ecspresso".freeze

  class << self
    def cmd_for(app) = "IMAGE_URL=#{Docker.image_url(app)} #{CMD_BASE} --config #{PROJECT_ROOT}/ecspresso/#{app}/config.yaml".freeze
  end
end

class PackageJson
  def initialize(path)
    @path = path
    @json = JSON.parse(File.read(path))
  end

  def to_s = JSON.pretty_generate(@json)

  def reload
    @json = JSON.parse(File.read(@path))
  end

  def [](key) = @json[key]

  def []=(key, value)
    self[key] = value
    save
  end

  def add_package(entry, type = 'dependencies')
    self[type] = {} unless self[type]
    self[type].merge!(entry)
    save
  end

  def remove_package(name, type = 'dependencies')
    self[type]&.delete(name)
    save
  end

  def localize_package(name, path = '.')
    self['dependencies'][name] = "file:#{path}/#{name}"
    save
  end

  alias remove_entry remove_package

  private

  def save
    File.open(@path, 'w') { |file| file.puts to_s }
  end
end

APP_DIR = {
  member: "#{PROJECT_ROOT}/apps/90-member",
  archer: "#{PROJECT_ROOT}/apps/90-archer",
}.freeze

namespace :deploy do
  @start_time = Time.now

  task :print_revision do
    puts "[#{@start_time.strftime('%H:%M:%S')}] Deploying revision #{Docker::COMMIT_HASH}"
  end

  task :ecr_login do
    printf `#{AWS::CMD} ecr get-login-password | docker login --username AWS --password-stdin #{Docker::BASE_URL}`
    raise 'Failed to login' unless $CHILD_STATUS.success?
  end

  task :prebuild do
    [:member, :archer].each do |app|
      app_path = APP_DIR[app]
      `cp ../yarn.lock #{app_path}`
      `mkdir -p #{app_path}/prisma && cp ../packages/archer-database/prisma/schema.prisma #{app_path}/prisma/`

      # replace monorepo package with local package
      `cp -r ../packages/archer-database #{app_path}/`
      `cp -r ../packages/utils #{app_path}/`
      package_json = PackageJson.new("#{app_path}/package.json")
      package_json.remove_package('prisma-erd-generator', 'optionalDependencies')
      package_json.remove_package('@prisma/generator-helper', 'optionalDependencies')
      package_json.remove_entry('schema', 'prisma')
      package_json.localize_package('archer-database')
      package_json.localize_package('utils')

      # copy package entries from project root package.json
      root_package_json = PackageJson.new("#{PROJECT_ROOT}/package.json")
      [
        '@emotion/react',
        '@emotion/styled',
        '@hookform/resolvers',
        '@mui/material',
        '@mui/x-date-pickers',
        '@next-auth/prisma-adapter',
        '@prisma/client',
        '@sendgrid/mail',
        'date-fns',
        'next-auth',
        'nodemailer',
        'prisma',
        'react',
        'react-dom',
        'react-hook-form',
        'zod',
        'zod-i18n-map',
      ].each do |package|
        package_json.add_package(package => root_package_json['devDependencies'][package])
      end
      ['typescript', '@types/node', '@tanstack/react-query-devtools'].each do |package|
        package_json.add_package({ package => root_package_json['devDependencies'][package] }, 'devDependencies')
      end

      # remove erd generator block
      prisma_schema = File.read("#{app_path}/prisma/schema.prisma")
      File.open("#{app_path}/prisma/schema.prisma", 'w') do |file|
        file.puts prisma_schema.gsub(/.*generator erd {([\s\S]*?)}/, '')
      end

      # merge tsconfig.json
      `cd #{app_path} && mv tsconfig.json tsconfig.json.old && jq -s '.[0] * .[1] | del(.extends)' ../../tsconfig.json tsconfig.json.old > tsconfig.json`
    end
  end

  task build_image: [:ecr_login, :prebuild] do
    build_args = {
      NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY: '${NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY}',
      SENTRY_AUTH_TOKEN: '${SENTRY_AUTH_TOKEN}',
    }.map { |k, v| "--build-arg #{k}=#{v}" }.join(' ')
    [:member, :archer].each do |app|
      puts "Building #{app} image..."
      printf `cd #{APP_DIR[app]} && docker buildx build --progress=plain #{build_args} --platform=linux/amd64 #{
        Docker.tags(app).map { "-t #{_1}" }.join(' ')} .`
      raise "Failed to build #{app} image" unless $CHILD_STATUS.success?
    end
  end

  task push_image: :build_image do
    [:member, :archer].each do |app|
      printf `docker push #{Docker.image_url(app)}`
      raise "Failed to push #{app} image" unless $CHILD_STATUS.success?
    end
  end

  task :update_service, [:app] => :push_image do
    cmd =
      [:member, :archer].map do |app|
        "#{ECSpresso.cmd_for(app)} deploy --force-new-deployment"
      end.join(' & ')
    printf `#{cmd}`
    raise 'Failed to deploy' unless $CHILD_STATUS.success?
  end

  task deploy: [:print_revision, :ecr_login, :build_image, :push_image, :update_service] do
    minutes, seconds = (Time.now - @start_time).divmod(60)
    puts "[#{Time.now.strftime('%H:%M:%S')}] deploy finished in #{minutes}:#{seconds.round}"

    # TODO: setup later
    # system 'gh release create', exception: true
    # `git pull --tags`
  end

  task :rollback, [:app] do |_, args|
    printf `#{ECSpresso.cmd_for(args[:app])} rollback --deregister-task-definition`
    raise "Failed to rollback #{args[:app]}" unless $CHILD_STATUS.success?
  end

  task :migrate_db do
    printf `#{ECSpresso.cmd_for(:member)} run --latest-task-definition --overrides-file=ecspresso/member/db-migrate.json`
    raise 'Failed to migrate' unless $CHILD_STATUS.success?
  end

  task :diff, [:app] do |_, args|
    printf `#{ECSpresso.cmd_for(args[:app])} diff`
  end

  task :status, [:app] do |_, args|
    printf `#{ECSpresso.cmd_for(args[:app])} status`
  end
end

task deploy: 'deploy:deploy'
# rubocop:enable Metrics/BlockLength, Layout/LineLength
