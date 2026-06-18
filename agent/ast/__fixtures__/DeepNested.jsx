export default function DeepNested() {
  return (
    <div className="level-1">
      <div className="level-2">
        <div className="level-3">
          <div className="level-4">
            <div className="level-5">
              <span className="leaf-node" data-testid="deep-leaf">
                Deep content
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
