<template>
  <div class="soft-index-panel main-right-panel mocktoon-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <el-radio-button :value="0">{{ t('service') }}</el-radio-button>
      <el-radio-button :value="1">{{ t('examples') }}</el-radio-button>
      <el-radio-button :value="2">{{ t('history') }}</el-radio-button>
      <el-radio-button :value="3">{{ t('logs') }}</el-radio-button>
    </el-radio-group>
    <div class="main-block"
      ><el-scrollbar
        ><div class="mocktoon-content">
          <el-alert
            v-for="(message, index) in errors"
            :key="index"
            :title="message"
            type="error"
            :closable="false"
            class="mb-3"
          />
          <el-alert
            v-for="(message, index) in warnings"
            :key="index"
            :title="message"
            type="warning"
            :closable="false"
            class="mb-3"
          />
          <template v-if="tab === 0">
            <el-alert :title="t('intro')" type="info" :closable="false" class="mb-4" />
            <el-card>
              <template #header>{{ t('runtime') }}</template>
              <el-alert
                v-if="!nodeVersions.length"
                :title="t('noNode')"
                type="warning"
                :closable="false"
                class="mb-3"
              />
              <el-form label-position="top" @submit.prevent>
                <el-form-item :label="t('node')">
                  <el-select
                    v-model="form.nodeBin"
                    class="w-full"
                    :disabled="busy || !!service?.run || mocktoon.installation.running"
                  >
                    <el-option
                      v-for="item in nodeVersions"
                      :key="item.bin"
                      :value="item.bin"
                      :label="`${item.version} — ${item.bin}`"
                    />
                  </el-select>
                </el-form-item>
                <el-button
                  :loading="mocktoon.installation.running"
                  :disabled="!form.nodeBin || !!service || busy"
                  @click="mocktoon.install(form.nodeBin)"
                  >{{ service ? t('installed') : t('install') }}</el-button
                >
              </el-form>
              <pre v-if="mocktoon.installation.log" class="mocktoon-log mt-3">{{
                mocktoon.installation.log
              }}</pre>
            </el-card>
            <el-card class="mt-4">
              <template #header
                ><div class="flex items-center justify-between"
                  ><span>{{ t('service') }}</span
                  ><el-tag :type="service?.run ? 'success' : 'info'">{{
                    t(service?.run ? 'running' : 'stopped')
                  }}</el-tag></div
                ></template
              >
              <p class="mb-3 text-sm opacity-75">{{ t('local') }}</p>
              <el-empty v-if="!mocktoon.profiles.length" :description="t('noProfiles')" />
              <el-table v-else :data="form.profiles" class="w-full">
                <el-table-column :label="t('enabled')" width="85"
                  ><template #default="{ row }"
                    ><el-checkbox v-model="row.enabled" :disabled="busy" /></template
                ></el-table-column>
                <el-table-column :label="t('name')" min-width="150"
                  ><template #default="{ row }"
                    >{{ mocktoon.profiles.find((p) => p.id === row.id)?.name
                    }}<div class="text-xs opacity-60">{{ row.id.slice(0, 8) }}</div></template
                  ></el-table-column
                >
                <el-table-column :label="t('port')" width="150"
                  ><template #default="{ row }"
                    ><el-input-number
                      v-model="row.port"
                      :min="1024"
                      :max="65535"
                      controls-position="right"
                      style="width: 130px"
                      :disabled="busy" /></template
                ></el-table-column>
                <el-table-column :label="t('scenario')" min-width="220"
                  ><template #default="{ row }"
                    ><el-select v-model="row.scenario" :disabled="busy"
                      ><el-option
                        v-for="scenario in scenarios"
                        :key="scenario"
                        :value="scenario"
                        :label="t(scenario)" /></el-select></template
                ></el-table-column>
                <el-table-column :label="t('url')" min-width="200"
                  ><template #default="{ row }"
                    ><code class="select-all">http://127.0.0.1:{{ row.port }}</code></template
                  ></el-table-column
                >
              </el-table>
              <el-alert
                v-if="dirty"
                :title="t('unsaved')"
                type="info"
                :closable="false"
                class="mt-3"
              />
              <div class="mt-4 flex flex-wrap gap-2">
                <el-button
                  type="primary"
                  :loading="mocktoon.mutation.running"
                  :disabled="!form.nodeBin || busy"
                  @click="mocktoon.saveSettings(form)"
                  >{{ t('save') }}</el-button
                >
                <el-button :loading="mocktoon.catalog.running" @click="mocktoon.refreshCatalog()">{{
                  t('refresh')
                }}</el-button>
                <el-button
                  type="success"
                  :disabled="
                    !service || !!service.run || busy || dirty || mocktoon.installation.running
                  "
                  @click="service?.serviceDo('start')"
                  >{{ t('start') }}</el-button
                >
                <el-button :disabled="!service?.run || busy" @click="service?.serviceDo('stop')">{{
                  t('stop')
                }}</el-button>
                <el-button
                  :disabled="!service?.run || busy || dirty || mocktoon.mutation.running"
                  @click="service?.serviceDo('restart')"
                  >{{ t('restart') }}</el-button
                >
              </div>
            </el-card>
          </template>
          <template v-else-if="tab === 1">
            <p class="mb-4 text-sm opacity-75">{{ t('editable') }}</p>
            <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <el-card v-for="example in examples" :key="example.id">
                <template #header
                  ><strong>{{ example.name }}</strong></template
                >
                <p class="mb-3 text-sm">{{ example.description }}</p>
                <code
                  v-for="endpoint in example.endpoints"
                  :key="endpoint"
                  class="block text-xs mb-1"
                  >{{ endpoint }}</code
                >
                <el-button
                  class="mt-3"
                  :disabled="mocktoon.mutation.running"
                  @click="mocktoon.create(example.id)"
                  >{{ t('use') }}</el-button
                >
              </el-card>
            </div>
            <el-card class="mt-4">
              <template #header>{{ t('edit') }}</template>
              <el-select
                v-model="selectedId"
                :placeholder="t('choose')"
                class="w-full mb-3"
                :disabled="mocktoon.inspection.running || mocktoon.mutation.running"
              >
                <el-option
                  v-for="profile in mocktoon.profiles"
                  :key="profile.id"
                  :value="profile.id"
                  :label="`${profile.name} — ${profile.id.slice(0, 8)}`"
                />
              </el-select>
              <template v-if="selectedId">
                <p class="mb-3 text-sm opacity-75">{{ t('editHelp') }}</p>
                <el-input
                  v-model="jsonDraft"
                  type="textarea"
                  :rows="20"
                  :disabled="mocktoon.inspection.running"
                  spellcheck="false"
                  class="mocktoon-editor"
                />
                <div class="mt-3 flex gap-2"
                  ><el-button
                    type="primary"
                    :loading="mocktoon.mutation.running"
                    :disabled="mocktoon.inspection.running"
                    @click="mocktoon.saveProfile(selectedId, jsonDraft)"
                    >{{ t('saveJson') }}</el-button
                  ><el-button
                    :disabled="mocktoon.inspection.running || mocktoon.mutation.running"
                    @click="mocktoon.inspect(selectedId)"
                    >{{ t('reload') }}</el-button
                  ></div
                >
              </template>
            </el-card>
          </template>
          <template v-else-if="tab === 2">
            <p class="mb-3 text-sm opacity-75">{{ t('historyHelp') }}</p>
            <div class="mb-3"
              ><el-button :loading="mocktoon.history.running" @click="mocktoon.refreshHistory()">{{
                t('refreshHistory')
              }}</el-button
              ><el-button
                :disabled="!!service?.run || busy || mocktoon.mutation.running"
                @click="mocktoon.clearHistory()"
                >{{ t('clear') }}</el-button
              ></div
            >
            <el-table :data="mocktoon.rows">
              <el-table-column type="expand"
                ><template #default="{ row }">
                  <pre class="mocktoon-log p-3">{{
                    JSON.stringify({ request: row.request, response: row.response }, null, 2)
                  }}</pre>
                </template></el-table-column
              >
              <el-table-column prop="time" :label="t('time')" min-width="180" />
              <el-table-column prop="environment" :label="t('name')" min-width="120" />
              <el-table-column prop="method" :label="t('method')" width="90" />
              <el-table-column prop="path" :label="t('path')" min-width="180" />
              <el-table-column prop="status" :label="t('status')" width="90" />
            </el-table>
          </template>
          <template v-else
            ><p class="mb-3 text-sm opacity-75">{{ t('logHelp') }}</p
            ><el-button :loading="mocktoon.logs.running" @click="mocktoon.refreshLogs()">{{
              t('inspectLog')
            }}</el-button
            ><pre class="mocktoon-log mt-3">{{ mocktoon.serviceOutput }}</pre>
          </template>
        </div></el-scrollbar
      ></div
    >
  </div>
</template>
<script lang="ts" setup>
  import { computed, onMounted, reactive, ref, watch } from 'vue'
  import { AppModuleSetup } from '@/core/Module'
  import { BrewStore } from '@/store/brew'
  import mocktoon from './controller'
  import { examples } from '../shared/Examples'
  import { scenarios, type Settings } from '../shared/types'
  import { t } from './lang'
  const { tab } = AppModuleSetup('mocktoon')
  const module = BrewStore().module('mocktoon'),
    nodeModule = BrewStore().module('node')
  const service = computed(() => module.installed[0])
  const busy = computed(() => module.starting || module.installed.some((item) => item.running))
  const nodeVersions = computed(() =>
    nodeModule.installed.filter((item) => item.enable && item.version)
  )
  const form = reactive<Settings>({ nodeBin: '', profiles: [] })
  const selectedId = ref(''),
    jsonDraft = ref('')
  const allOperations = [
    mocktoon.loading,
    mocktoon.catalog,
    mocktoon.installation,
    mocktoon.mutation,
    mocktoon.inspection,
    mocktoon.history,
    mocktoon.logs
  ]
  const errors = computed(() => [
    ...new Set(allOperations.map((operation) => operation.error).filter(Boolean))
  ])
  const warnings = computed(() => [
    ...allOperations.map((operation) => operation.warning).filter(Boolean),
    ...mocktoon.skipped.map((reason) => `${t('skipped')} ${reason}`)
  ])
  const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(mocktoon.settings))
  watch(
    [() => mocktoon.settings, () => mocktoon.profiles, nodeVersions],
    () => {
      form.nodeBin = mocktoon.settings.nodeBin || form.nodeBin || nodeVersions.value[0]?.bin || ''
      form.profiles = mocktoon.profiles.map((profile) => ({
        ...(mocktoon.settings.profiles.find((item) => item.id === profile.id) ?? {
          id: profile.id,
          port: profile.port,
          enabled: false,
          scenario: 'request' as const
        })
      }))
    },
    { immediate: true }
  )
  watch(selectedId, (id) => {
    jsonDraft.value = ''
    if (id) void mocktoon.inspect(id)
  })
  watch(
    () => mocktoon.source,
    (source) => {
      if (source?.id === selectedId.value) jsonDraft.value = source.text
    }
  )
  onMounted(() => {
    void mocktoon.load()
    void nodeModule.fetchInstalled()
  })
</script>
<style scoped lang="scss">
  .mocktoon-panel .main-block {
    min-height: 0;
    overflow: hidden;
  }
  .mocktoon-content {
    padding: 16px 0 24px;
  }
  .mocktoon-log {
    max-height: 440px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 12px;
  }
  .mocktoon-editor :deep(textarea) {
    font-family: monospace;
    font-size: 12px;
  }
</style>
