<template>
  <li
    v-if="showItem"
    :class="'non-draggable' + (currentPage === '/mocktoon' ? ' active' : '')"
    @click="nav"
  >
    <div class="left">
      <div class="icon-block" :class="{ run: serviceRunning }"
        ><yb-icon
          :svg="import('../assets/mocktoon.svg?raw')"
          width="30"
          height="30"
          style="padding: 4px"
      /></div>
      <span class="title">Mocktoon</span>
    </div>
    <el-switch
      v-model="serviceRunning"
      :disabled="serviceDisabled || mocktoon.mutation.running || mocktoon.installation.running"
      @click.stop="stopNav"
      @change="switchChange"
    />
  </li>
</template>
<script lang="ts" setup>
  import { AsideSetup, AppServiceModule } from '@/core/ASide'
  import { BrewStore } from '@/store/brew'
  import mocktoon from './controller'
  const {
    showItem,
    serviceDisabled,
    serviceFetching,
    serviceRunning,
    currentPage,
    groupDo,
    switchChange,
    nav,
    stopNav
  } = AsideSetup('mocktoon')
  BrewStore().module('mocktoon').startExtParam = () => mocktoon.startParams()
  AppServiceModule.mocktoon = {
    groupDo,
    switchChange,
    serviceRunning,
    serviceFetching,
    serviceDisabled,
    showItem,
    participatesInGroup: false
  } as any
</script>
