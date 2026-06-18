export type WorkflowQAAnswers = {
  useWebSearch: boolean
  useKeywordPlanner: boolean
  generateSummary: boolean
  summaryChannels: string[]
  generateImage: boolean
  imageChannels: string[]
  generateVideo: boolean
  videoChannels: string[]
  translate: boolean
  translationChannels: string[]
  targetLanguages: string[]
  additionalMessage: string
}

export function createDefaultWorkflowQAAnswers(
  additionalMessage = "",
): WorkflowQAAnswers {
  return {
    useWebSearch: false,
    useKeywordPlanner: false,
    generateSummary: false,
    summaryChannels: [],
    generateImage: false,
    imageChannels: [],
    generateVideo: false,
    videoChannels: [],
    translate: false,
    translationChannels: [],
    targetLanguages: [],
    additionalMessage,
  }
}
